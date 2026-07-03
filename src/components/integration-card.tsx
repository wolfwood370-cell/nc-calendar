import type { ReactNode } from "react";

export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface IntegrationCardProps {
  title: string;
  description: string;
  /** Icona principale (componente JSX) renderizzata nel quadrato colorato a sinistra. */
  icon: ReactNode;
  /** Background del quadrato dell'icona: colore brand PIENO (hex o CSS color). */
  iconBg: string;
  /** Colore brand (mantenuto per compatibilità; il proto non usa accent bar). */
  accentColor?: string;
  /** True se l'integrazione è connessa (usato come fallback per status). */
  connected: boolean;
  /** Stato esplicito; se assente, derivato da `connected`. */
  status?: IntegrationStatus;
  /** Children — controlli o info aggiuntive (Switch toggle, ultima sync, ecc.). */
  children: ReactNode;
}

/**
 * Card visuale di un'integrazione esterna (Google Calendar, Stripe, ecc.)
 * nella pagina trainer/integrations: riga orizzontale con logo pieno 48px
 * + titolo con status pill inline + descrizione, e sezione children sotto.
 * Variante "error" mostra un banner rosso al posto dei children.
 */
export function IntegrationCard({
  title,
  description,
  icon,
  iconBg,
  connected,
  status,
  children,
}: IntegrationCardProps) {
  const resolvedStatus: IntegrationStatus = status ?? (connected ? "connected" : "disconnected");
  return (
    <div className="bg-white rounded-3xl px-6 py-5 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {/* Logo 48px a tinta brand piena, glifo bianco */}
          <div
            className="size-12 shrink-0 rounded-[14px] grid place-items-center"
            style={{ backgroundColor: iconBg }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base font-bold text-on-surface">{title}</h3>
              <StatusPill status={resolvedStatus} />
            </div>
            <p className="mt-1 text-[13px] text-outline">{description}</p>
          </div>
        </div>
      </div>
      {resolvedStatus === "error" ? (
        <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Errore di connessione. Riprova a collegare l'account.
        </div>
      ) : (
        <div className="mt-4 space-y-3">{children}</div>
      )}
    </div>
  );
}

export interface StatusPillProps {
  status: IntegrationStatus;
}

/**
 * Pill che mostra lo stato dell'integrazione: Connesso (verde) /
 * Errore (rosso) / Non connesso (grigio), inline accanto al titolo.
 */
export function StatusPill({ status }: StatusPillProps) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-[5px] rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[11px] font-semibold text-success-strong">
        <span className="size-1.5 rounded-full bg-success-strong" />
        Connesso
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-[5px] rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
        <span className="size-1.5 rounded-full bg-red-500" />
        Errore di connessione
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-0.5 text-[11px] font-semibold text-outline">
      Non connesso
    </span>
  );
}
