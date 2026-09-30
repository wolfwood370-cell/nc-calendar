// ----------------------------------------------------------------------------
// L'installazione dalla Home (lato cliente, passata 05, audit N5)
// ----------------------------------------------------------------------------
// HomeInstallCard: «Installa NC Calendar» finché l'app non risulta installata
// (usePwaInstall: display-mode standalone, appinstalled o «Ho installato
// l'app») e finché il cliente non ha scelto «Non ora», che vale per sempre,
// per utente e per dispositivo: una chiave in localStorage
// (installHiddenKey), letta e scritta dentro try/catch. «Come installarla»
// apre il foglio della 01; il foglio resta montato anche quando la card
// sparisce («Ho installato l'app»), così si chiude e rende il focus.
// Quando la card sparisce il focus va dove dice returnFocus (la pagina:
// l'ultimo titolo prima della card, altrimenti il contenuto), mai sul body.
// ----------------------------------------------------------------------------

import { Download } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ClientButton } from "@/components/client-button";
import { ClientInstallSheet } from "@/components/client-install-sheet";
import { usePwaInstall } from "@/hooks/use-pwa";
import { installHiddenKey } from "@/lib/client-home";

// «Non ora» scritto qui non avvisa nessuno da solo: un piccolo store, come le
// notifiche lette della cornice.
const hiddenListeners = new Set<() => void>();

function subscribeHidden(listener: () => void) {
  hiddenListeners.add(listener);
  return () => {
    hiddenListeners.delete(listener);
  };
}

function readHidden(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export interface HomeInstallCardProps {
  /** L'utente: «Non ora» vale per lui. */
  userId: string;
  /** Dove va il focus quando la card sparisce. */
  returnFocus: () => HTMLElement | null | undefined;
}

export function HomeInstallCard({ userId, returnFocus }: HomeInstallCardProps) {
  const { installed, markedInstalled } = usePwaInstall();
  const key = installHiddenKey(userId);
  // Sul server la card non c'è: niente lampo per chi l'ha già chiusa.
  const stored = useSyncExternalStore(
    subscribeHidden,
    () => readHidden(key),
    () => true,
  );
  // Con localStorage negato «Non ora» vale almeno finché si resta sulla Home
  // (il layout rimonta la pagina a ogni navigazione).
  const [hiddenNow, setHiddenNow] = useState(false);
  const [open, setOpen] = useState(false);
  const visible = !installed && !markedInstalled && !stored && !hiddenNow;

  const notNow = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* storage pieno o negato: la card sparisce lo stesso, finché si resta sulla Home */
    }
    setHiddenNow(true);
    for (const listener of hiddenListeners) listener();
    toast.info("Puoi installarla quando vuoi dal Profilo.");
    returnFocus()?.focus({ preventScroll: true });
  };

  return (
    <>
      {visible && (
        <section
          data-home-install
          className="flex items-start gap-3.5 rounded-[24px] border border-outline-variant/35 bg-white px-[18px] py-4"
        >
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary-container/10 text-primary-container"
          >
            <Download className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="font-sans text-[15px] font-bold tracking-normal">
              Installa NC Calendar
            </h2>
            <p className="text-[13px] leading-[1.45] text-on-surface-variant">
              Apri l'app dalla schermata Home e ricevi le notifiche sulle sessioni.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <ClientButton variant="tonal" onClick={() => setOpen(true)}>
                Come installarla
              </ClientButton>
              <ClientButton
                variant="text"
                className="text-sm text-on-surface-variant"
                onClick={notNow}
              >
                Non ora
              </ClientButton>
            </div>
          </div>
        </section>
      )}
      <ClientInstallSheet
        open={open}
        onOpenChange={setOpen}
        from="home"
        returnFocus={returnFocus}
      />
    </>
  );
}
