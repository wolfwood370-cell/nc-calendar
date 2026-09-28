// ----------------------------------------------------------------------------
// ClientTabHeader — l'intestazione delle cinque schede (lato cliente, passata
// 01, audit N3 e V10)
// ----------------------------------------------------------------------------
// Home, Prenota, Sessioni, Booster e Profilo: titolo grande su una riga con
// l'ellissi, sottotitolo facoltativo, campanella a destra. Attaccata in alto
// mentre si scorre; da md in su si attacca sotto l'header desktop del layout
// (alto 56), che porta già la sua campanella: qui si vede solo sotto md.
// Sotto la riga, con gap 14, i children (il controllo segmentato di
// Sessioni, passata 03). L'altra intestazione è ClientPageHeader, per le
// pagine aperte: ogni pagina del cliente ne usa una delle due.
// ----------------------------------------------------------------------------

import type { ReactNode } from "react";
import { ClientNotificationsBell } from "@/components/client-notifications-bell";

export interface ClientTabHeaderProps {
  title: string;
  /** Una riga sotto il titolo; niente riga se manca. */
  subtitle?: ReactNode;
  children?: ReactNode;
}

export function ClientTabHeader({ title, subtitle, children }: ClientTabHeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 flex flex-col gap-3.5 bg-surface/92 px-5 pb-3 backdrop-blur-[16px] md:top-14"
      style={{ paddingTop: "calc(12px + env(safe-area-inset-top))" }}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate font-display text-[28px] leading-[1.15] font-bold tracking-[-0.02em] text-on-surface">
            {title}
          </h1>
          {subtitle ? <p className="text-sm text-on-surface-variant">{subtitle}</p> : null}
        </div>
        <ClientNotificationsBell className="md:hidden" />
      </div>
      {children}
    </header>
  );
}
