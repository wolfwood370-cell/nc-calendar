// ----------------------------------------------------------------------------
// ClientPageHeader — l'intestazione delle pagine aperte (lato cliente,
// passata 01, audit N3 e D5)
// ----------------------------------------------------------------------------
// Dettaglio sessione e Notifiche: Indietro, titolo centrato, niente campanella
// e niente barra in basso. Indietro torna alla schermata di provenienza: alla
// voce prima nella cronologia se è una pagina dell'app (useCanGoBack: la voce
// di oggi non è la prima caricata dall'app), altrimenti al ripiego di
// backFallback (Sessione → Sessioni, Notifiche → Home). Attaccata in alto;
// da md in su sotto l'header desktop del layout (56 px più 1 di bordo).
// ----------------------------------------------------------------------------

import { useCanGoBack, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { backFallback } from "@/lib/client-shell";

export function ClientPageHeader({ title }: { title: string }) {
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const back = () => {
    if (canGoBack) router.history.back();
    else void navigate({ to: backFallback(pathname) });
  };

  return (
    <header
      className="sticky top-0 z-30 grid grid-cols-[44px_1fr_44px] items-center gap-2 bg-surface/92 px-3 pb-2 backdrop-blur-[16px] md:top-[57px]"
      style={{ paddingTop: "calc(6px + env(safe-area-inset-top))" }}
    >
      <button
        type="button"
        onClick={back}
        aria-label="Indietro"
        className="grid size-11 place-items-center rounded-full border border-outline-variant/60 bg-white text-aura-primary transition-transform active:scale-95"
      >
        <ChevronLeft className="size-[22px]" aria-hidden />
      </button>
      <h1 className="truncate text-center font-sans text-[17px] font-bold tracking-normal text-on-surface">
        {title}
      </h1>
      <span aria-hidden />
    </header>
  );
}
