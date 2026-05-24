import type { ReactNode } from "react";
import { Clock } from "lucide-react";

export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface IntegrationCardProps {
  title: string;
  description: string;
  /** Icona principale (componente JSX) renderizzata nel quadrato colorato top-left. */
  icon: ReactNode;
  /** Background del quadrato dell'icona (hex o CSS color). */
  iconBg: string;
  /** Bordo sinistro accent al hover (hex o CSS color). */
  accentColor: string;
  /** True se l'integrazione è connessa (usato come fallback per status). */
  connected: boolean;
  /** Stato esplicito; se assente, derivato da `connected`. */
  status?: IntegrationStatus;
  /** Children — controlli o info aggiuntive (Switch toggle, ultima sync, ecc.). */
  children: ReactNode;
}

/**
 * Card visuale di un'integrazione esterna (Google Calendar, Stripe, ecc.)
 * nella pagina trainer/integrations: icona + status pill + titolo + descr
 * + sezione children. Variante "error" mostra un banner rosso al posto
 * dei children.
 *
 * Estratto da trainer.integrations.tsx assieme a StatusPill e
 * TokenExpiryBadge.
 */
export function IntegrationCard({
  title,
  description,
  icon,
  iconBg,
  accentColor,
  connected,
  status,
  children,
}: IntegrationCardProps) {
  const resolvedStatus: IntegrationStatus = status ?? (connected ? "connected" : "disconnected");
  return (
    <div className="group relative overflow-hidden bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0px_10px_30px_rgba(0,86,133,0.1)]">
      <div
        className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex items-start justify-between gap-3 mb-4">
        <div
          className="size-14 rounded-2xl grid place-items-center"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
        <StatusPill status={resolvedStatus} />
      </div>
      <h3 className="font-display text-lg font-semibold text-aura-primary mb-1">{title}</h3>
      <p className="text-sm text-outline mb-5 min-h-[40px]">{description}</p>
      {resolvedStatus === "error" ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Errore di connessione. Riprova a collegare l'account.
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </div>
  );
}

export interface TokenExpiryBadgeProps {
  /** Scadenza del token OAuth; null = nessun badge mostrato. */
  expiresAt: Date | null;
}

/**
 * Badge che mostra la scadenza dell'access token Google OAuth. L5
 * (FULL_APP_AUDIT.md): coaches vedono a colpo d'occhio se il prossimo
 * sync rischia di fallire — l'access token ruota ~ogni ora, ma se il
 * refresh token è stato revocato (account disconnesso lato Google)
 * l'access token scade e sync-calendar auto-disabilita gcal_enabled.
 */
export function TokenExpiryBadge({ expiresAt }: TokenExpiryBadgeProps) {
  if (!expiresAt) return null;
  const now = Date.now();
  const ms = expiresAt.getTime() - now;
  const expired = ms <= 0;
  const fmt = expiresAt.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const className = expired
    ? "inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-[11px] font-medium"
    : "inline-flex items-center gap-1.5 rounded-full bg-surface-container-low text-outline px-2.5 py-1 text-[11px] font-medium";
  const label = expired ? `Token scaduto (${fmt}) — verrà rinnovato` : `Token valido fino a ${fmt}`;
  return (
    <span className={className}>
      <Clock className="size-3" /> {label}
    </span>
  );
}

export interface StatusPillProps {
  status: IntegrationStatus;
}

/**
 * Pill che mostra lo stato dell'integrazione: Connesso (verde) /
 * Errore (rosso) / Non connesso (grigio). Stilizzata con design-token
 * Aura per le varianti success/error (tokens in src/styles.css).
 */
export function StatusPill({ status }: StatusPillProps) {
  if (status === "connected") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
        style={{
          backgroundColor: "var(--color-status-success-bg)",
          color: "var(--color-on-status-success)",
        }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: "var(--color-on-status-success)" }}
        />
        Connesso
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-3 py-1 text-xs font-medium">
        <span className="size-1.5 rounded-full bg-red-500" />
        Errore di connessione
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low text-outline px-3 py-1 text-xs font-medium">
      <span className="size-1.5 rounded-full bg-outline-variant" />
      Non connesso
    </span>
  );
}
