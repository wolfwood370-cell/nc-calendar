// ----------------------------------------------------------------------------
// Pannello dettagli di un evento del Calendario desktop (audit C3, passata 04)
// ----------------------------------------------------------------------------
// Sostituisce «Focus Cliente» sul desktop: si apre solo al clic su un evento
// (o con ?event= nell'URL), Esc e ✕ lo chiudono, mai vuoto. Fisso a destra,
// 390px, sotto l'header. Azioni: check-in e assenza (session-outcome.ts),
// Modifica, Annulla sessione ed Elimina (dialog condiviso della 02).
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  CircleCheck,
  Clock,
  Loader2,
  MessageCircle,
  Pencil,
  Trash2,
  Undo2,
  UserX,
  X,
} from "lucide-react";
import type { StatusTone } from "@/lib/calendar-events";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

export interface PanelCredit {
  key: string;
  name: string;
  color: string;
  left: number;
  total: number;
  label: string;
}

export interface CalendarDetailsPanelProps {
  kindLabel: string;
  color: string;
  title: string;
  when: string;
  status: { label: string; tone: StatusTone };
  confirm: { label: string; confirmed: boolean } | null;
  canCheck: boolean;
  isDone: "completed" | "no_show" | null;
  /** Le sessioni annullate si guardano soltanto. */
  canEdit: boolean;
  cancelLabel: string | null;
  canDelete: boolean;
  busy: boolean;
  client: {
    id: string;
    name: string;
    plan: string;
    whatsapp: string | null;
    credits: readonly PanelCredit[];
    note: string | null;
  } | null;
  notOnGoogle: boolean;
  repairing: boolean;
  onClose: () => void;
  onCheckIn: () => void;
  onAbsent: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRepair: () => void;
}

const TONE: Record<StatusTone, string> = {
  neutral: "bg-surface-container text-on-surface-variant",
  warning: "bg-warning-soft text-warning-text",
  success: "bg-success-soft text-success-text",
  danger: "bg-danger-soft text-danger-text",
};

export function CalendarDetailsPanel(p: CalendarDetailsPanelProps) {
  return (
    <aside
      aria-label="Dettagli evento"
      className="fixed bottom-0 right-0 top-14 z-[60] flex w-[390px] max-w-[100vw] flex-col overflow-auto border-l border-surface-container bg-white shadow-[-20px_0_60px_rgba(0,0,0,0.12)]"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-[18px]">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-on-surface-variant">
          <span
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: p.color }}
            aria-hidden
          />
          {p.kindLabel}
        </span>
        <button
          type="button"
          onClick={p.onClose}
          aria-label="Chiudi dettagli"
          className="grid size-9 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <X className="size-[18px]" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 px-5 pb-5 pt-2">
        <h2 className="font-display text-2xl font-bold leading-tight text-on-surface">{p.title}</h2>
        <p className="text-sm text-on-surface-variant">{p.when}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={cn("rounded-full px-2.5 py-[3px] text-xs font-bold", TONE[p.status.tone])}
          >
            {p.status.label}
          </span>
          {p.confirm && (
            <span
              className={cn(
                "flex items-center gap-[5px] text-xs font-semibold",
                p.confirm.confirmed ? "text-success-text" : "text-warning-text",
              )}
            >
              {p.confirm.confirmed ? (
                <CircleCheck className="size-3.5" aria-hidden />
              ) : (
                <Clock className="size-3.5" aria-hidden />
              )}
              {p.confirm.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-5 pb-5">
        {p.canCheck && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={p.busy}
              onClick={p.onCheckIn}
              className="flex h-[42px] flex-1 items-center justify-center gap-1.5 rounded-full bg-primary-container text-sm font-semibold text-white transition-colors hover:bg-aura-primary disabled:opacity-60"
            >
              {p.busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden />
              )}
              Check-in
            </button>
            <button
              type="button"
              disabled={p.busy}
              onClick={p.onAbsent}
              className="flex h-[42px] items-center gap-1.5 rounded-full border border-surface-variant px-4 text-sm font-semibold text-on-surface-variant transition-colors hover:border-danger-line hover:text-danger-text disabled:opacity-60"
            >
              <UserX className="size-4" aria-hidden />
              Assente
            </button>
          </div>
        )}
        {p.isDone && (
          <button
            type="button"
            disabled={p.busy}
            onClick={p.onUndo}
            className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-surface-container text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-variant disabled:opacity-60"
          >
            <Undo2 className="size-[15px]" aria-hidden />
            {p.isDone === "no_show" ? "Annulla assenza" : "Annulla check-in"}
          </button>
        )}
        {(p.canEdit || p.cancelLabel) && (
          <div className="flex gap-2">
            {p.canEdit && (
              <button
                type="button"
                onClick={p.onEdit}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-surface-variant text-sm font-semibold text-on-surface-variant transition-colors hover:border-primary-container hover:text-aura-primary"
              >
                <Pencil className="size-[15px]" aria-hidden />
                Modifica
              </button>
            )}
            {p.cancelLabel && (
              <button
                type="button"
                onClick={p.onCancel}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-danger-soft text-sm font-semibold text-danger-text transition-colors hover:bg-danger-line/60"
              >
                <Trash2 className="size-[15px]" aria-hidden />
                {p.cancelLabel}
              </button>
            )}
          </div>
        )}
      </div>

      {p.client && (
        <>
          <div className="mx-5 flex flex-col gap-3.5 rounded-[20px] bg-surface-container-low p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-avatar-placeholder text-[15px] font-bold text-on-avatar-placeholder">
                {initials(p.client.name)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold text-on-surface">
                  {p.client.name}
                </span>
                <span className="text-xs text-on-surface-variant">{p.client.plan}</span>
              </div>
            </div>
            {p.client.credits.length > 0 && (
              <div className="flex flex-col gap-2">
                {p.client.credits.map((k) => (
                  <div key={k.key} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-on-surface-variant">{k.name}</span>
                      <span className="font-semibold tabular-nums text-on-surface">{k.label}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-variant">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${k.total ? Math.round((k.left / k.total) * 100) : 0}%`,
                          backgroundColor: k.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Link
                to="/trainer/clients/$id"
                params={{ id: p.client.id }}
                className="flex h-[38px] flex-1 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-aura-primary transition-colors hover:bg-surface-container"
              >
                Apri profilo
              </Link>
              {p.client.whatsapp && (
                <a
                  href={p.client.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full bg-white text-[13px] font-semibold text-[#0b8043] transition-colors hover:bg-surface-container"
                >
                  <MessageCircle className="size-[15px]" aria-hidden />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
          <div className="mx-5 mt-3.5 flex flex-col gap-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-outline">
              Nota dell'ultima sessione
            </p>
            <p className="whitespace-pre-wrap text-sm leading-normal text-on-surface-variant">
              {p.client.note ?? "Nessuna nota registrata."}
            </p>
          </div>
        </>
      )}

      <div className="mt-auto flex flex-col gap-2.5 p-5">
        {p.notOnGoogle && (
          <div className="flex items-center justify-between gap-2.5 rounded-[14px] bg-warning-soft px-3 py-2.5 text-[13px] text-warning-text">
            <span>Non presente su Google Calendar</span>
            <button
              type="button"
              disabled={p.repairing}
              onClick={p.onRepair}
              className="flex items-center gap-1 text-[13px] font-bold text-aura-primary disabled:opacity-60"
            >
              {p.repairing && <Loader2 className="size-3 animate-spin" aria-hidden />}
              Ricrea
            </button>
          </div>
        )}
        {p.canDelete && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={p.onDelete}
              className="text-[13px] font-semibold text-danger-text"
            >
              Inserita per errore? Elimina
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
