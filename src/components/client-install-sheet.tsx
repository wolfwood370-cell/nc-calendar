// ----------------------------------------------------------------------------
// ClientInstallSheet — il foglio «Installa NC Calendar» (lato cliente,
// passata 01, audit N5)
// ----------------------------------------------------------------------------
// Al posto della finestra che si apriva da sola 800 ms dopo il primo accesso:
// l'installazione si propone da un foglio che il cliente apre, dalla card
// della Home (passata 05) e dalla voce del Profilo (07). Tre passi per Safari
// e una nota per Android. Se il browser ha offerto l'installazione diretta
// (beforeinstallprompt, catturato una volta sola in use-pwa.ts), il pulsante
// principale è «Installa» e apre il prompt del sistema; altrimenti è «Ho
// installato l'app», che lascia il segno APP_INSTALLED_KEY sul dispositivo.
// Con «Ho installato l'app», o con «Installa» accettato, il foglio si chiude
// col toast «App installata…»; se il cliente rifiuta il prompt del sistema,
// il foglio si chiude senza toast.
// ----------------------------------------------------------------------------

import { Upload } from "lucide-react";
import { toast } from "sonner";
import { ClientButton } from "@/components/client-button";
import { ClientSheet } from "@/components/client-sheet";
import { usePwaInstall } from "@/hooks/use-pwa";

export interface ClientInstallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Da dove si apre: dal Profilo il terzo passo dice «…da qui». */
  from: "home" | "profilo";
  /**
   * Dove va il focus alla chiusura se il pulsante che ha aperto il foglio non
   * c'è più (la card della Home sparisce con «Ho installato l'app»).
   */
  returnFocus?: () => HTMLElement | null | undefined;
}

export function ClientInstallSheet({
  open,
  onOpenChange,
  from,
  returnFocus,
}: ClientInstallSheetProps) {
  const { canInstall, triggerInstall, markInstalled } = usePwaInstall();

  const installed = () => {
    markInstalled();
    onOpenChange(false);
    toast.success("App installata: attiva le notifiche dal Profilo.");
  };

  const install = async () => {
    const outcome = await triggerInstall();
    if (outcome === "accepted") installed();
    else if (outcome === "dismissed") onOpenChange(false);
  };

  const steps = [
    <>
      In Safari tocca Condividi
      <Upload className="size-[18px] shrink-0 text-primary-container" aria-hidden />
    </>,
    <>Scegli «Aggiungi alla schermata Home»</>,
    <>
      {from === "profilo"
        ? "Apri NC Calendar dall'icona e attiva le notifiche da qui"
        : "Apri NC Calendar dall'icona e attiva le notifiche dal Profilo"}
    </>,
  ];

  return (
    <ClientSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocus={returnFocus}
      title="Installa NC Calendar"
      list
    >
      <ol className="flex flex-col gap-3">
        {steps.map((text, i) => (
          <li key={i} className="flex items-center gap-3 text-[15px] leading-[1.4] text-on-surface">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-container text-sm font-bold text-white">
              {i + 1}
            </span>
            <span className="flex items-center gap-2">{text}</span>
          </li>
        ))}
      </ol>
      <p className="text-[13px] leading-normal text-on-surface-variant">
        Su Android: menu del browser, poi «Installa app».
      </p>
      {canInstall ? (
        <ClientButton fullWidth onClick={() => void install()}>
          Installa
        </ClientButton>
      ) : (
        <ClientButton fullWidth onClick={installed}>
          Ho installato l'app
        </ClientButton>
      )}
      <ClientButton variant="text" fullWidth onClick={() => onOpenChange(false)}>
        Chiudi
      </ClientButton>
    </ClientSheet>
  );
}
