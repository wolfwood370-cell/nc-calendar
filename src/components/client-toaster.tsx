// ----------------------------------------------------------------------------
// ClientToaster — il Toaster dell'app, con le props del cliente sulle sue route
// ----------------------------------------------------------------------------
// Un Toaster solo, sempre montato nella radice e sempre lo stesso componente:
// sulle route del cliente riceve le props di questo file, fuori tiene quelle
// di prima (richColors, in alto a destra), così React lo tiene e cambia solo
// le props. Perché non un Toaster nel layout del cliente (sonner 2.0.7):
// (a) due Toaster senza id mostrano ogni toast due volte; (b) un Toaster che
// si smonta al confine di /client perde i toast in volo, e il login fa
// toast.success e subito navigate; (c) il layout del cliente, mentre carica,
// non monta niente.
// Il toast del cliente (V1): in basso al centro, 12 px sopra la barra quando
// la barra si vede (sotto md, nelle cinque schede: 1 px di bordo, 6 di
// padding, 58 di scheda e la safe area), altrimenti 12 px sopra la safe area.
// Sotto 600 px è largo lo schermo meno 12 px per lato, sopra è largo 356 px e
// centrato: sonner usa mobileOffset sotto 600 px e offset sopra, e fra 600 e
// 767 la barra c'è ancora, quindi contano tutti e due. Scuro, icona 18,
// azione alta 44; 3,2 s senza azione, 8 s con un'azione (toastWithUndo).
// Senza lo stile di sonner (unstyled): il suo CSS non sta in un layer e
// batterebbe le classi di Tailwind, e scrive la description #3f3f3f, che sul
// fondo scuro fa circa 1,6:1.
// ----------------------------------------------------------------------------

import type { ComponentProps } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useDesktop } from "@/hooks/use-desktop";
import { isClientPath, showsTabBar } from "@/lib/client-shell";

type ToasterProps = ComponentProps<typeof Toaster>;

/** Quanto resta un toast del cliente senza azione (README, V1: circa 3 s). */
const CLIENT_TOAST_DURATION = 3200;

/** Le props di prima: coach, admin, accesso. */
const APP_TOASTER: ToasterProps = { richColors: true, position: "top-right" };

const CLIENT_ICONS: ToasterProps["icons"] = {
  success: <CircleCheck className="size-[18px] text-toast-ok" />,
  warning: <TriangleAlert className="size-[18px] text-toast-warn" />,
  // Nel prototipo i toni sono tre (ok, avviso, info): l'errore è un avviso.
  error: <TriangleAlert className="size-[18px] text-toast-warn" />,
  info: <Info className="size-[18px] text-on-primary-container" />,
};

const CLIENT_TOAST_OPTIONS: ToasterProps["toastOptions"] = {
  unstyled: true,
  classNames: {
    toast:
      "flex w-full items-center gap-3 rounded-2xl bg-toast py-2 pr-2 pl-4 font-sans text-sm leading-[1.35] text-white shadow-[0_12px_32px_rgba(0,0,0,0.25)] [&[data-expanded=false][data-front=false]>*]:opacity-0",
    icon: "flex shrink-0 items-center",
    content: "flex min-w-0 flex-1 flex-col gap-0.5 py-2",
    title: "font-normal",
    // Bianco al 75% sul #191c1f: circa 9,9:1.
    description: "text-[13px] leading-snug text-white/75",
    actionButton:
      "h-11 shrink-0 rounded-xl bg-transparent px-3 text-sm font-bold text-on-primary-container active:bg-white/10 focus-visible:outline-on-primary-container",
    cancelButton:
      "h-11 shrink-0 rounded-xl bg-transparent px-3 text-sm font-semibold text-white/80 active:bg-white/10 focus-visible:outline-on-primary-container",
  },
};

function clientToaster(tabBar: boolean): ToasterProps {
  const bottom = tabBar
    ? "calc(65px + max(6px, env(safe-area-inset-bottom)) + 12px)"
    : "calc(12px + env(safe-area-inset-bottom))";
  return {
    position: "bottom-center",
    offset: { bottom },
    mobileOffset: { bottom, left: 12, right: 12 },
    duration: CLIENT_TOAST_DURATION,
    icons: CLIENT_ICONS,
    toastOptions: CLIENT_TOAST_OPTIONS,
  };
}

export function ClientToaster() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const wide = useDesktop();
  // La barra c'è sotto md, e finché la larghezza non è misurata si fa come se ci fosse.
  const props = isClientPath(path)
    ? clientToaster(showsTabBar(path) && wide !== true)
    : APP_TOASTER;
  return <Toaster {...props} />;
}
