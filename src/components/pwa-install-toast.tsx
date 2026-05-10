import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePwaInstall } from "@/hooks/use-pwa";

/** Mostra un toast proattivo per installare la PWA dopo 2s. */
export function PwaInstallToast() {
  const { canInstall, isIos, triggerInstall, dismiss, wasDismissed } = usePwaInstall();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    if (wasDismissed()) return;

    if (canInstall) {
      const t = setTimeout(() => {
        shown.current = true;
        const id = toast("Installa l'App NC Training", {
          description:
            "Aggiungi l'app alla schermata Home per prenotare più velocemente e ricevere le notifiche.",
          duration: 10000,
          action: {
            label: "Installa",
            onClick: () => {
              void triggerInstall();
            },
          },
          cancel: {
            label: "Non ora",
            onClick: () => {
              dismiss();
              toast.dismiss(id);
            },
          },
        });
      }, 2000);
      return () => clearTimeout(t);
    }

    if (isIos) {
      const t = setTimeout(() => {
        shown.current = true;
        const id = toast("Installa l'App NC Training", {
          description:
            "Tocca il tasto Condividi di Safari e scegli 'Aggiungi a Home' per installare l'app.",
          duration: 10000,
          cancel: {
            label: "Ho capito",
            onClick: () => {
              dismiss();
              toast.dismiss(id);
            },
          },
        });
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [canInstall, isIos, triggerInstall, dismiss, wasDismissed]);

  return null;
}
