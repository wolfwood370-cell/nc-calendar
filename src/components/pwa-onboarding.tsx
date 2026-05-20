import { useEffect, useState } from "react";
import { Share, Plus, Smartphone, Download, Check, X, Sparkles } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const SEEN_KEY = "pwa_onboarding_seen";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

interface Step {
  icon: typeof Share;
  text: string;
}

/**
 * Full-screen onboarding overlay that appears once on first login for users
 * who haven't installed the PWA. Platform-aware: iOS users get Safari
 * Share-sheet instructions, Android users get a native install button.
 */
export function PwaOnboarding() {
  const { canInstall, triggerInstall } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const ios = isIos();
  const android = !ios;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    // Delay slightly so it feels like a guided welcome, not a popup blocker.
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const handleInstall = async () => {
    const outcome = await triggerInstall();
    if (outcome === "accepted") dismiss();
  };

  const iosSteps: Step[] = [
    { icon: Share, text: "Tocca l'icona Condividi in basso nella barra di Safari." },
    { icon: Plus, text: "Scorri e seleziona \"Aggiungi alla schermata Home\"." },
    { icon: Smartphone, text: "Apri l'app dall'icona sul tuo telefono per un'esperienza nativa." },
  ];

  const androidSteps: Step[] = [
    { icon: Download, text: "Tocca il pulsante Installa qui sotto." },
    { icon: Check, text: "Conferma l'aggiunta alla schermata Home." },
    { icon: Smartphone, text: "Gestisci i tuoi allenamenti come un'app nativa." },
  ];

  const steps = ios ? iosSteps : androidSteps;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="p-0 gap-0 max-w-md w-[calc(100vw-2rem)] sm:rounded-[32px] rounded-[32px] border-outline-variant/30 bg-surface-container-lowest overflow-hidden [&>button]:hidden">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Chiudi"
          className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-surface-container-high/80 text-on-surface backdrop-blur transition-transform active:scale-95"
        >
          <X className="size-4" />
        </button>

        <div className="relative overflow-hidden bg-gradient-to-br from-[#005685] to-[#00375a] px-8 pt-10 pb-8 text-white">
          <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col items-center gap-3 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-white/15 backdrop-blur">
              <Sparkles className="size-7" />
            </div>
            <h2 className="font-display text-2xl font-semibold leading-tight">
              Installa NC Calendar
            </h2>
            <p className="text-sm text-white/85 max-w-xs">
              Un'esperienza pensata su misura per te: notifiche, accesso rapido e zero distrazioni.
            </p>
          </div>
        </div>

        <div className="px-7 py-6 flex flex-col gap-4">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex items-start gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container font-semibold">
                  {i + 1}
                </div>
                <div className="flex flex-1 items-start gap-3 pt-1">
                  <Icon className="size-5 shrink-0 text-on-surface-variant mt-0.5" />
                  <p className="text-sm leading-relaxed text-on-surface">{s.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-7 pb-7 flex flex-col gap-2">
          {android && canInstall && (
            <button
              type="button"
              onClick={handleInstall}
              className="w-full rounded-full bg-[#005685] px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-transform active:scale-95 hover:opacity-95 flex items-center justify-center gap-2"
            >
              <Download className="size-4" />
              Installa ora
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-full border border-outline-variant bg-transparent px-6 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            Continua nel browser
          </button>
          <p className="text-[11px] text-on-surface-variant/70 text-center mt-1 px-2">
            Puoi installare l'app in qualsiasi momento dalle impostazioni del tuo browser.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
