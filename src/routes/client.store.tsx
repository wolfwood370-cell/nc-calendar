// ----------------------------------------------------------------------------
// Booster (lato cliente, passata 06, audit S1-S5, H7, V12, V14)
// ----------------------------------------------------------------------------
// Prima di pagare il cliente sa quanti crediti compra, per quale tipologia e
// fino a quando valgono; dopo il pagamento vede l'esito. Chi non compra vede
// solo il perché. Ogni testo, numero e condizione viene da client-store.ts,
// sopra lo stato dei crediti di Prenota; la data dei Booster è quella del
// file condiviso con booster-checkout. La pagina non legge niente da sé: lo
// stato dei crediti e gli acquisti da useClientBookState, i pacchetti da
// useBoosterPacks.
// Gli stati, nell'ordine: il caricamento; una lettura persa (la card con
// «Riprova», che resta mentre rilegge); chi non compra (S5); lo Store, con la
// validità, gli acquisti del blocco, i prodotti e la nota di Stripe.
// I fogli stanno fuori da quei rami:
//   - «Riepilogo», da «Acquista»: se intanto il cliente non compra più (lo
//     stato si rilegge) si chiude da solo e il focus va sul titolo della card
//     che resta (V12);
//   - «Pagamento completato», col ritorno da Stripe (booster=success): rilegge
//     gli acquisti ogni 2 secondi finché i crediti non arrivano o non passano
//     20 secondi (i giri li conta la pagina, il limite lo dice storeOutcome);
//     alla chiusura l'indirizzo perde booster e session e tiene type.
// Con booster=cancel il toast una volta, e l'indirizzo perde booster subito.
// Il coach è NO_COACH finché non c'è get_my_coach (02/10/2026), come nelle
// altre pagine: i testi dicono «il tuo coach», niente WhatsApp.
// ----------------------------------------------------------------------------

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BookRetryCard } from "@/components/book-blocked-card";
import {
  StoreBoughtCard,
  StoreEmptyCard,
  StoreLockCard,
  StoreProductCard,
  StoreValidityBox,
} from "@/components/client-store-cards";
import { StoreDoneSheet, StoreSummarySheet } from "@/components/client-store-sheets";
import { ClientTabHeader } from "@/components/client-tab-header";
import { AuraSkeleton } from "@/components/ui/aura-skeleton";
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useClientShell } from "@/hooks/use-client-shell";
import { supabase } from "@/integrations/supabase/client";
import { NO_COACH } from "@/lib/client-book";
import { clientPageTitle } from "@/lib/client-shell";
import {
  STORE_CANCEL_TOAST,
  STORE_FOOTER,
  STORE_POLL_MS,
  storeBought,
  storeEmpty,
  storeLock,
  storeOutcome,
  storePayError,
  storeProducts,
  storeSearch,
  storeSummary,
  storeValidity,
  type StorePack,
  type StorePurchase,
} from "@/lib/client-store";
import { parseEdgeError } from "@/lib/edge-function-error";
import { useBoosterPacks, type EventTypeRow } from "@/lib/queries";
import { arrivedRead, lostRead } from "@/lib/query-state";

const DESCRIPTION = "Crediti in più per il blocco in corso: i Booster e fino a quando valgono.";

export const Route = createFileRoute("/client/store")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Booster") },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: clientPageTitle("Booster") },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // type (la tipologia in testa), booster (l'esito di Stripe), session (la
  // sessione di Stripe): ogni altro valore si ignora.
  validateSearch: storeSearch,
  component: StorePage,
});

// Il coach nei testi: il cliente oggi non legge il profilo del coach. Nome e
// WhatsApp arriveranno da get_my_coach, con le migrazioni del 02/10/2026.
const COACH = NO_COACH;

const NO_PACKS: StorePack[] = [];
const NO_PURCHASES: StorePurchase[] = [];
const NO_EVENT_TYPES: EventTypeRow[] = [];

/**
 * L'indirizzo di checkout dalla risposta di booster-checkout, solo se è la
 * pagina di Stripe (difesa da un reindirizzamento verso un altro sito).
 */
function stripeCheckoutUrl(data: unknown): string | null {
  const raw = (data as { checkout_url?: unknown } | null)?.checkout_url;
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Il messaggio del pagamento in una risposta 2xx, se c'è. */
function bodyError(data: unknown): string | null {
  const error = (data as { error?: unknown } | null)?.error;
  return typeof error === "string" ? error : null;
}

/** L'esito del ritorno da Stripe: i parametri restano mentre il foglio si chiude. */
interface DoneState {
  open: boolean;
  session: string | null;
  typeId: string | null;
}

function StorePage() {
  const { now } = useClientShell();
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  const { client, eventTypesQ, extrasQ, loading, failed, state, input, retry, retrying } =
    useClientBookState(now, COACH);
  const packsQ = useBoosterPacks();
  const pageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lockTitleRef = useRef<HTMLHeadingElement>(null);

  const typeParam = search.type ?? null;
  const eventTypes = eventTypesQ.data ?? NO_EVENT_TYPES;
  const purchases = extrasQ.data ?? NO_PURCHASES;

  const lock = useMemo(
    () => (state && client ? storeLock(client, state, COACH, now) : null),
    [client, state, now],
  );
  const validity = useMemo(
    () => (state && client ? storeValidity(client, state, now) : null),
    [client, state, now],
  );
  const products = useMemo(
    () => storeProducts(packsQ.data ?? NO_PACKS, eventTypes, COACH, typeParam),
    [packsQ.data, eventTypes, typeParam],
  );
  const bought = state ? storeBought(purchases, eventTypes, state) : [];

  const pageLoading = loading || !arrivedRead(packsQ);
  const showRetry = !pageLoading && (failed || lostRead(packsQ) || !state || !input);

  // Il titolo della pagina: dove torna il focus quando il foglio dell'esito,
  // che si apre da solo, si chiude. L'h1 dell'intestazione non è focalizzabile
  // da sé: prende tabIndex -1 la prima volta.
  const pageTitle = () => {
    const h1 = pageRef.current?.querySelector<HTMLElement>("h1") ?? null;
    if (h1 && !h1.hasAttribute("tabindex")) h1.tabIndex = -1;
    return h1;
  };

  // Torna all'indirizzo senza l'esito di Stripe, tenendo la tipologia.
  const clearReturn = () => {
    void navigate({
      to: "/client/store",
      search: typeParam ? { type: typeParam } : {},
      replace: true,
      resetScroll: false,
    });
  };

  // ---- «Riepilogo» --------------------------------------------------------
  // La chiave resta dopo la chiusura: il foglio tiene i testi mentre si chiude.
  const [summaryKey, setSummaryKey] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);
  const product = products.find((p) => p.key === summaryKey) ?? null;
  const summary = useMemo(
    () => (product && validity && input ? storeSummary(product, validity, input) : null),
    [product, validity, input],
  );

  // V12: il cliente non compra più (lo stato si è riletto): il foglio si
  // chiude e non si riapre da solo se poi torna a comprare. Lo stesso se il
  // riepilogo resta senza contenuto per un altro motivo (il pacchetto non c'è
  // più, lo stato si sta rileggendo): aperto e vuoto si riaprirebbe da solo.
  const locked = lock !== null;
  const hasSummary = summary !== null;
  useEffect(() => {
    if (locked || !hasSummary) setSummaryOpen(false);
  }, [locked, hasSummary]);

  // Tornati indietro da Stripe, il browser può rimettere la pagina com'era
  // (la cache avanti e indietro): «Paga» resterebbe occupato.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      payingRef.current = false;
      setPaying(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const openSummary = (key: string) => {
    setSummaryKey(key);
    setSummaryOpen(true);
  };

  const pay = async () => {
    if (!product || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    let message: string | null = null;
    try {
      // Senza client_id: il pagamento compra per chi chiama.
      const { data, error } = await supabase.functions.invoke("booster-checkout", {
        body: { package_type: product.key },
      });
      if (error) {
        message = await parseEdgeError(error);
      } else {
        const url = stripeCheckoutUrl(data);
        if (url) {
          // Il pulsante resta occupato finché la pagina di Stripe non si apre.
          window.location.assign(url);
          return;
        }
        message = bodyError(data);
      }
    } catch {
      message = null;
    }
    toast.error(storePayError(message));
    payingRef.current = false;
    setPaying(false);
  };

  // ---- Il ritorno da Stripe ------------------------------------------------
  const success = search.booster === "success";
  const sessionParam = search.session ?? null;
  const [done, setDone] = useState<DoneState | null>(null);
  const [rounds, setRounds] = useState(0);
  useEffect(() => {
    if (!success) return;
    setDone({ open: true, session: sessionParam, typeId: typeParam });
    setRounds(0);
  }, [success, sessionParam, typeParam]);

  const outcome = useMemo(
    () =>
      done && input
        ? storeOutcome({
            purchases,
            session: done.session,
            typeId: done.typeId,
            elapsedMs: rounds * STORE_POLL_MS,
            input,
            coach: COACH,
          })
        : null,
    [done, input, purchases, rounds],
  );

  // Finché i crediti non arrivano: una rilettura degli acquisti e un giro ogni
  // 2 secondi. Arrivati, o dopo 20 secondi, si ferma. Una rilettura ancora in
  // corso non si annulla (cancelRefetch): con la rete lenta ogni giro
  // annullerebbe il precedente, e la riga non arriverebbe mai.
  const waiting = done?.open === true && outcome?.kind === "waiting";
  const refetchExtras = extrasQ.refetch;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => {
      void refetchExtras({ cancelRefetch: false });
      setRounds((n) => n + 1);
    }, STORE_POLL_MS);
    return () => window.clearInterval(id);
  }, [waiting, refetchExtras]);

  const closeDone = () => {
    setDone((d) => (d ? { ...d, open: false } : d));
    clearReturn();
  };

  // «Prenota ora»: il link porta a Prenota nello stesso giro. La cronologia
  // del router unisce le due scritture in una sola, e l'indirizzo con
  // booster=success resterebbe dietro Prenota: il replace si scrive subito.
  const bookFromDone = () => {
    closeDone();
    router.history.flush();
  };

  // Annullato su Stripe: il toast una volta (anche col doppio effetto di
  // sviluppo), e l'indirizzo perde l'esito, così ricaricando non torna.
  const cancelled = search.booster === "cancel";
  const cancelToasted = useRef(false);
  useEffect(() => {
    if (!cancelled) return;
    if (!cancelToasted.current) {
      cancelToasted.current = true;
      toast.info(STORE_CANCEL_TOAST, { id: "booster-cancel" });
    }
    void navigate({
      to: "/client/store",
      search: typeParam ? { type: typeParam } : {},
      replace: true,
      resetScroll: false,
    });
  }, [cancelled, typeParam, navigate]);

  // ---- «Riprova» -----------------------------------------------------------
  // Riletto tutto, la card dell'errore lascia il posto allo Store e il
  // pulsante che aveva il focus sparisce con lei: il focus va sul contenuto.
  const retried = useRef(false);
  const onRetry = () => {
    retried.current = true;
    retry();
    void packsQ.refetch();
  };
  useEffect(() => {
    const root = contentRef.current;
    if (!retried.current || showRetry || pageLoading || !root) return;
    retried.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) root.focus({ preventScroll: true });
  }, [showRetry, pageLoading]);

  let content: ReactNode;
  if (pageLoading) {
    content = <StoreSkeleton />;
  } else if (showRetry) {
    content = (
      <BookRetryCard
        title="I Booster non si sono caricati"
        text="Non siamo riusciti a leggere i Booster e i tuoi crediti. Riprova tra poco."
        onRetry={onRetry}
        retrying={retrying || packsQ.isFetching}
      />
    );
  } else if (lock) {
    content = <StoreLockCard lock={lock} titleRef={lockTitleRef} />;
  } else {
    content = (
      <>
        {validity && <StoreValidityBox text={validity.text} />}
        {bought.length > 0 && <StoreBoughtCard rows={bought} />}
        {products.length > 0 ? (
          products.map((p) => (
            <StoreProductCard key={p.key} product={p} onBuy={() => openSummary(p.key)} />
          ))
        ) : (
          <StoreEmptyCard text={storeEmpty(COACH)} />
        )}
        <p className="text-center text-[13px] leading-normal text-on-surface-variant">
          {STORE_FOOTER}
        </p>
      </>
    );
  }

  return (
    <div ref={pageRef}>
      <ClientTabHeader title="Booster" subtitle="Crediti in più per il blocco in corso" />
      <div
        ref={contentRef}
        tabIndex={-1}
        className="flex flex-col gap-4 px-4 pt-2 pb-8 outline-none"
      >
        {content}
      </div>

      <StoreSummarySheet
        open={summaryOpen && !locked}
        onOpenChange={(open) => {
          if (!open) setSummaryOpen(false);
        }}
        summary={summary}
        paying={paying}
        onPay={() => void pay()}
        returnFocus={() => lockTitleRef.current ?? contentRef.current}
      />
      <StoreDoneSheet
        open={done?.open === true}
        onOpenChange={(open) => {
          if (!open) closeDone();
        }}
        outcome={outcome}
        returnFocus={pageTitle}
        onBook={bookFromDone}
      />
    </div>
  );
}

/** Il caricamento: il riquadro della validità e due prodotti. */
function StoreSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <AuraSkeleton className="h-[76px] rounded-[18px]" />
      <AuraSkeleton className="h-[176px] rounded-[24px]" />
      <AuraSkeleton className="h-[176px] rounded-[24px]" />
    </div>
  );
}
