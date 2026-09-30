import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isClientPath } from "@/lib/client-shell";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa_install_dismissed";

/**
 * Il segno che lascia «Ho installato l'app» nel foglio di installazione del
 * cliente: su iPhone il browser non dice se l'app è stata aggiunta alla
 * schermata Home. La card della Home (passata 05) e la voce del Profilo (07)
 * lo leggono insieme a display-mode: standalone.
 */
export const APP_INSTALLED_KEY = "nc-app-installed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// La cattura di beforeinstallprompt, una sola per tutta l'app (passata 01 del
// lato cliente). Il browser manda l'evento una volta, presto: un componente
// che si mette in ascolto quando si apre (il foglio di installazione) lo ha
// già perso. Quindi l'evento sta qui, a livello di modulo, sopravvive ai
// montaggi, e l'ascolto lo avvia la radice dell'app (__root.tsx, passata 05):
// chi apre prima /auth e poi entra non lo perde. L'evento si tiene sempre;
// preventDefault(), che nasconde la mini-barra d'installazione di Chrome, solo
// sulle route del cliente (isClientPath): su /auth e sul lato coach la
// mini-barra resta, come prima.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let appInstalled = false;
let capturing = false;
let prompting = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Avvia l'ascolto di beforeinstallprompt e appinstalled; chiamarla di nuovo non fa niente. */
export function startInstallCapture(): void {
  if (capturing || typeof window === "undefined") return;
  capturing = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    if (isClientPath(window.location.pathname)) e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    appInstalled = true;
    deferredPrompt = null;
    emit();
  });
}

function readMarkedInstalled(): boolean {
  try {
    return localStorage.getItem(APP_INSTALLED_KEY) !== null;
  } catch {
    return false;
  }
}

export function usePwaInstall() {
  const prompt = useSyncExternalStore(
    subscribe,
    () => deferredPrompt,
    () => null,
  );
  const installedNow = useSyncExternalStore(
    subscribe,
    () => appInstalled,
    () => false,
  );
  const markedInstalled = useSyncExternalStore(subscribe, readMarkedInstalled, () => false);
  const [standalone] = useState<boolean>(() => isStandalone());
  const installed = standalone || installedNow;

  // Chi legge l'evento si assicura che l'ascolto sia partito (di solito l'ha
  // già avviato la radice).
  useEffect(() => {
    startInstallCapture();
  }, []);

  /**
   * Apre il prompt del sistema: "accepted", "dismissed", oppure null se non
   * c'è un evento o il prompt non si apre (un secondo tocco mentre il primo è
   * aperto, un evento già usato). Il prompt si apre una volta sola per evento:
   * dopo, torna «Installa» solo se il browser manda un altro invito.
   */
  const triggerInstall = useCallback(async (): Promise<"accepted" | "dismissed" | null> => {
    const current = deferredPrompt;
    if (!current || prompting) return null;
    prompting = true;
    try {
      await current.prompt();
      const choice = await current.userChoice;
      return choice.outcome;
    } catch {
      return null;
    } finally {
      prompting = false;
      deferredPrompt = null;
      emit();
    }
  }, []);

  /** «Ho installato l'app»: il segno resta sul dispositivo. */
  const markInstalled = useCallback(() => {
    try {
      localStorage.setItem(APP_INSTALLED_KEY, "1");
    } catch {
      /* storage pieno o negato: niente segno, nessun crash */
    }
    emit();
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  const wasDismissed = useCallback((): boolean => {
    try {
      return !!localStorage.getItem(DISMISS_KEY);
    } catch {
      return false;
    }
  }, []);

  return {
    canInstall: !!prompt && !installed,
    installed,
    markedInstalled,
    isIos: isIos() && !installed,
    triggerInstall,
    markInstalled,
    dismiss,
    wasDismissed,
  };
}
