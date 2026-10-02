// ----------------------------------------------------------------------------
// Profilo (lato cliente, passata 07, audit R1-R5, H6, N5, O4 e V6)
// ----------------------------------------------------------------------------
// Dall'alto: l'identità del cliente, la card «Il tuo coach», «Il tuo
// percorso», «Notifiche», «Account» ed «Esci». Nessuna statistica della Home
// (R5): il percorso dice gli stessi numeri e le stesse date della Home, e la
// presenza è quella di Sessioni. Ogni riga e ogni testo viene da
// client-settings.ts; la pagina non fa conti suoi: nessuna data, nessun
// conteggio, nessuna lunghezza di password. Il coach da useMyCoach
// (get_my_coach); il profilo, i blocchi, le sessioni e lo stato dei crediti
// da useClientBookState, lo stesso di Home, Prenota e Sessioni.
// Gli stati del percorso, nell'ordine: il caricamento (lo scheletro); una
// lettura persa (la card con «Riprova»); le righe. Notifiche, account ed
// «Esci» non aspettano le letture: col percorso perso si cambia la password e
// si esce.
// Lo stato delle notifiche sul telefono (le API del browser, il service
// worker, l'iscrizione) si legge una volta al montaggio; l'installazione da
// usePwaInstall. «Ho installato l'app» nel foglio d'installazione può togliere
// il pulsante che l'ha aperto («Come fare» delle notifiche): il focus torna
// sul titolo «Account».
// Il collegamento a Google resta il giro di oggi (decisione 11 del
// 30/09/2026): si esce e si rientra con «Continua con Google» usando la
// stessa email; niente linkIdentity, niente «Scollega».
// ----------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  ChevronRight,
  Download,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BookRetryCard } from "@/components/book-blocked-card";
import { ClientButton } from "@/components/client-button";
import { ClientInstallSheet } from "@/components/client-install-sheet";
import { GoogleLinkSheet, PasswordSheet } from "@/components/client-settings-sheets";
import { ClientSwitch } from "@/components/client-switch";
import { ClientTabHeader } from "@/components/client-tab-header";
import { AuraSkeleton } from "@/components/ui/aura-skeleton";
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useClientShell } from "@/hooks/use-client-shell";
import { useMyCoach } from "@/hooks/use-my-coach";
import { usePwaInstall } from "@/hooks/use-pwa";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { clientAttendance } from "@/lib/client-sessions";
import {
  PASSWORD_SAVED_TOAST,
  PUSH_DENIED_TOAST,
  PUSH_ERROR_TOAST,
  PUSH_OFF_TOAST,
  PUSH_ON_TOAST,
  calendarInviteText,
  coachCard,
  googleLinkToast,
  googleLinked,
  googleRow,
  installRow,
  passwordSaveError,
  profileIdentity,
  profilePathRows,
  pushRow,
  type CoachLinkKind,
} from "@/lib/client-settings";
import { clientPageTitle } from "@/lib/client-shell";
import {
  getCurrentPushSubscription,
  isPushReady,
  isPushSupported,
  subscribeToPush,
} from "@/lib/push";

const DESCRIPTION = "I tuoi dati, il tuo coach, il percorso, le notifiche e l'account.";

export const Route = createFileRoute("/client/settings")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Profilo") },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: clientPageTitle("Profilo") },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientSettings,
});

// Le card a elenco della Home (client-home-next.tsx), con le righe separate
// da una linea #f2f3f8 (surface-container-low).
const LIST_CARD = "overflow-hidden rounded-[24px] border border-outline-variant/35 bg-white";
const ROW_SEP = "border-t border-surface-container-low first:border-t-0";
// Righe di almeno 52 px, padding 10 e 16.
const ROW = "flex min-h-[52px] items-center gap-3 px-4 py-2.5";
// I titoli di sezione in Manrope 14/700, come la Home: la regola base di
// styles.css mette Sora e -0.02em su ogni h2.
const SECTION_TITLE = "px-1 font-sans text-sm font-bold tracking-normal text-on-surface-variant";
const ROW_TITLE = "text-[15px] font-bold";
const ROW_SUB = "text-[13px] leading-[1.4] text-on-surface-variant";

const LINK_ICON: Record<CoachLinkKind, LucideIcon> = {
  whatsapp: MessageCircle,
  tel: Phone,
  mail: Mail,
};

/** Quello che il browser dice delle push, letto una volta al montaggio. */
interface PushDevice {
  supported: boolean;
  ready: boolean;
  enabled: boolean;
}

function ClientSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { now } = useClientShell();
  const { coach, row: coachRow } = useMyCoach();
  const {
    profile,
    profileArrived,
    client,
    blocksQ,
    bookingsQ,
    loading,
    failed,
    state,
    retry,
    retrying,
  } = useClientBookState(now, coach);
  const { installed, markedInstalled } = usePwaInstall();

  const [device, setDevice] = useState<PushDevice | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [sheet, setSheet] = useState<"password" | "google" | "install" | null>(null);
  const accountRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let alive = true;
    const supported = isPushSupported();
    void Promise.all([isPushReady(), getCurrentPushSubscription().catch(() => null)]).then(
      ([ready, sub]) => {
        if (alive) setDevice({ supported, ready, enabled: sub !== null });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const identity = profileIdentity(profile, user?.email);
  const card = coachCard(coachRow);
  const rows =
    state && client && blocksQ.data && bookingsQ.data
      ? profilePathRows(client, blocksQ.data, clientAttendance(bookingsQ.data, now), now)
      : null;
  const push = device ? pushRow({ ...device, installed, markedInstalled }) : null;
  const invite = calendarInviteText(profile?.email);
  const google = googleRow(googleLinked(user));
  const install = installRow(installed, markedInstalled);

  const togglePush = async (next: boolean) => {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      if (next) {
        await subscribeToPush(user.id);
        setDevice((d) => (d ? { ...d, enabled: true } : d));
        toast.success(PUSH_ON_TOAST);
      } else {
        const sub = await getCurrentPushSubscription();
        if (sub) {
          await sub.unsubscribe();
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("profile_id", user.id)
            .eq("endpoint", sub.endpoint);
        }
        setDevice((d) => (d ? { ...d, enabled: false } : d));
        toast.success(PUSH_OFF_TOAST);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : "";
      if (message.includes("permesso")) toast.warning(PUSH_DENIED_TOAST);
      else toast.error(PUSH_ERROR_TOAST);
    } finally {
      setPushBusy(false);
    }
  };

  // Il foglio della password: null se è andata, altrimenti l'errore da dire sotto il campo.
  const savePassword = async (password: string): Promise<string | null> => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return passwordSaveError(error);
    toast.success(PASSWORD_SAVED_TOAST);
    return null;
  };

  const linkGoogle = async () => {
    setSheet(null);
    toast.info(googleLinkToast(identity.email));
    await signOut();
    void navigate({ to: "/auth" });
  };

  const logout = async () => {
    await signOut();
    void navigate({ to: "/auth" });
  };

  let path: ReactNode;
  if (loading) {
    path = <AuraSkeleton className="h-[220px] rounded-[24px]" aria-busy="true" />;
  } else if (failed || !rows) {
    path = (
      <BookRetryCard
        title="Il percorso non si è caricato"
        text="Non siamo riusciti a leggere il tuo percorso. Riprova tra poco."
        onRetry={retry}
        retrying={retrying}
      />
    );
  } else {
    path = (
      <div className={LIST_CARD}>
        {rows.map((r) => (
          <div key={r.label} className={`${ROW} justify-between ${ROW_SEP}`}>
            <span className="text-[15px] text-on-surface-variant">{r.label}</span>
            <span className="text-right text-[15px] font-bold tabular-nums">{r.value}</span>
          </div>
        ))}
        {state?.canBuy && (
          <Link to="/client/store" className={`${ROW} text-aura-primary ${ROW_SEP}`}>
            <Sparkles className="size-[18px]" aria-hidden />
            <span className="flex-1 text-[15px] font-bold">Booster</span>
            <ChevronRight className="size-[18px] text-outline" aria-hidden />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      <ClientTabHeader title="Profilo" />
      <div className="flex flex-col gap-5 px-4 pt-1 pb-8">
        {profileArrived ? (
          <section className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-container font-display text-2xl font-bold text-white"
            >
              {identity.initials}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-xl font-bold">{identity.name}</p>
              {identity.email && (
                <p className="truncate text-sm text-on-surface-variant">{identity.email}</p>
              )}
              {identity.phone && (
                <p className="text-sm text-on-surface-variant tabular-nums">{identity.phone}</p>
              )}
            </div>
          </section>
        ) : (
          <div className="flex items-center gap-3.5" aria-busy="true">
            <AuraSkeleton className="size-16 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <AuraSkeleton className="h-5 w-2/3 rounded-full" />
              <AuraSkeleton className="h-4 w-1/2 rounded-full" />
            </div>
          </div>
        )}

        {card && (
          <section
            aria-labelledby="profilo-coach"
            className="flex flex-col gap-3.5 rounded-[24px] border border-outline-variant/35 bg-white px-[18px] py-4 shadow-soft-card"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-fixed text-[15px] font-bold text-aura-primary"
              >
                {card.initials}
              </span>
              <div className="flex min-w-0 flex-col">
                <span
                  id="profilo-coach"
                  className="text-[13px] font-semibold text-on-surface-variant"
                >
                  Il tuo coach
                </span>
                <span className="truncate text-[17px] font-bold">{card.name}</span>
              </div>
            </div>
            {card.links.length > 0 && (
              // Tante colonne quanti sono i collegamenti: col coach di oggi
              // «Email» a tutta larghezza. Sotto i 360 px le icone si
              // nascondono: a 320 «WhatsApp» con l'icona non ci sta.
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${card.links.length}, minmax(0, 1fr))` }}
              >
                {card.links.map((l) => {
                  const Icon = LINK_ICON[l.kind];
                  return (
                    <a
                      key={l.kind}
                      href={l.href}
                      {...(l.kind === "whatsapp"
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="flex h-12 items-center justify-center gap-1.5 rounded-[14px] bg-primary-container/8 text-sm font-bold text-aura-primary"
                    >
                      <Icon className="size-4 shrink-0 max-[360px]:hidden" aria-hidden />
                      {l.label}
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className={SECTION_TITLE}>Il tuo percorso</h2>
          {path}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className={SECTION_TITLE}>Notifiche</h2>
          <div className={LIST_CARD}>
            <div className={`flex items-center gap-3 px-4 py-3.5 ${ROW_SEP}`}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id="profilo-push" className={ROW_TITLE}>
                  Notifiche sul telefono
                </span>
                {push && <span className={ROW_SUB}>{push.text}</span>}
              </div>
              {push?.control === "switch" && (
                // Mentre lavora è aria-disabled e non disabled, come «Riprova» di
                // BookRetryCard: resta nell'albero e tiene il focus (a un pulsante
                // disabled il browser lo toglie); il tocco si ignora in togglePush.
                <ClientSwitch
                  aria-labelledby="profilo-push"
                  aria-disabled={pushBusy || undefined}
                  checked={push.checked}
                  onCheckedChange={(v) => void togglePush(v)}
                />
              )}
              {push?.control === "come-fare" && (
                <ClientButton variant="tonal" onClick={() => setSheet("install")}>
                  Come fare
                </ClientButton>
              )}
            </div>
            {invite && (
              <div className={`flex gap-3 px-4 py-3.5 ${ROW_SEP}`}>
                <CalendarCheck
                  className="mt-0.5 size-[18px] shrink-0 text-primary-container"
                  aria-hidden
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={ROW_TITLE}>Inviti del calendario</span>
                  <span className={ROW_SUB}>{invite}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 ref={accountRef} tabIndex={-1} className={SECTION_TITLE}>
            Account
          </h2>
          <div className={LIST_CARD}>
            <div className={`flex items-center gap-3 px-4 py-3.5 ${ROW_SEP}`}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={ROW_TITLE}>Accesso con Google</span>
                <span className={ROW_SUB}>{google.text}</span>
              </div>
              {google.link && (
                <ClientButton variant="tonal" onClick={() => setSheet("google")}>
                  Collega
                </ClientButton>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSheet("password")}
              className={`${ROW} w-full text-left ${ROW_SEP}`}
            >
              <KeyRound className="size-[18px] text-primary-container" aria-hidden />
              <span className={`flex-1 ${ROW_TITLE}`}>Cambia password</span>
              <ChevronRight className="size-[18px] text-outline" aria-hidden />
            </button>
            {install.opens ? (
              <button
                type="button"
                onClick={() => setSheet("install")}
                className={`${ROW} w-full text-left ${ROW_SEP}`}
              >
                <Download className="size-[18px] text-primary-container" aria-hidden />
                <span className={`flex-1 ${ROW_TITLE}`}>{install.label}</span>
                <ChevronRight className="size-[18px] text-outline" aria-hidden />
              </button>
            ) : (
              <div className={`${ROW} ${ROW_SEP}`}>
                <Download className="size-[18px] text-primary-container" aria-hidden />
                <span className={`flex-1 ${ROW_TITLE}`}>{install.label}</span>
              </div>
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full border border-outline-variant text-base font-bold text-danger-text"
        >
          <LogOut className="size-[18px]" aria-hidden />
          Esci
        </button>
      </div>

      <PasswordSheet
        open={sheet === "password"}
        onOpenChange={(open) => setSheet(open ? "password" : null)}
        onSave={savePassword}
      />
      <GoogleLinkSheet
        open={sheet === "google"}
        onOpenChange={(open) => setSheet(open ? "google" : null)}
        email={identity.email}
        onConfirm={() => void linkGoogle()}
      />
      <ClientInstallSheet
        open={sheet === "install"}
        onOpenChange={(open) => setSheet(open ? "install" : null)}
        from="profilo"
        returnFocus={() => accountRef.current}
      />
    </div>
  );
}
