// ----------------------------------------------------------------------------
// FocusClientPanel — right-side panel on /trainer/calendar showing the
// currently-focused client (selected from a booking on the grid)
// ----------------------------------------------------------------------------
// Extracted from trainer.calendar.tsx. Pure presentational — parent owns
// the focus state, the client/notes queries, and passes everything down.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { Calendar as CalendarIcon, MessageCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { ProfileRow } from "@/lib/queries";

export interface FocusClientPanelProps {
  focusClient: ProfileRow | null;
  focusClientId: string | null;
  isLoading: boolean;
  lastNote: { scheduled_at: string; trainer_notes: string } | null;
  isLoadingNote: boolean;
}

export function FocusClientPanel({
  focusClient,
  focusClientId,
  isLoading,
  lastNote,
  isLoadingNote,
}: FocusClientPanelProps) {
  // Aura strict card shape: rounded-[24px], border-outline-variant/30,
  // shadow-soft-blue. Used for every inner data card in the panel.
  const cardClass =
    "bg-surface-container-lowest rounded-[24px] shadow-soft-blue border border-outline-variant/30";

  if (!focusClientId) {
    return (
      <div className={`${cardClass} p-6 text-center text-sm text-outline`}>
        <CalendarIcon className="size-10 mx-auto mb-3 text-outline-variant" />
        Seleziona una sessione confermata per vedere il dettaglio cliente.
      </div>
    );
  }

  if (!focusClient && isLoading) {
    return (
      <div className={`${cardClass} p-6 space-y-3`}>
        <Skeleton className="size-20 rounded-full mx-auto" />
        <Skeleton className="h-4 w-2/3 mx-auto" />
        <Skeleton className="h-3 w-1/2 mx-auto" />
        <Skeleton className="h-9 w-full rounded-full" />
      </div>
    );
  }

  if (!focusClient) {
    return (
      <div className={`${cardClass} p-6 text-center text-sm text-outline`}>
        Cliente non trovato.
      </div>
    );
  }

  const initials =
    (focusClient.full_name ?? "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const phoneDigits = focusClient.phone ? focusClient.phone.replace(/\D/g, "") : "";

  return (
    <>
      <div className={`${cardClass} p-6 flex flex-col items-center text-center`}>
        <div className="size-20 rounded-full bg-primary-fixed text-aura-primary flex items-center justify-center text-2xl font-bold border-4 border-surface mb-3 shadow-sm">
          {initials}
        </div>
        <h4 className="text-lg font-bold text-on-surface">{focusClient.full_name ?? "Cliente"}</h4>
        <p className="text-sm text-on-surface-variant mb-4 break-all">{focusClient.email ?? ""}</p>
        <Button
          asChild
          variant="secondary"
          className="w-full min-h-11 bg-surface-container-low text-on-surface hover:bg-surface-container rounded-full font-semibold"
        >
          <Link to="/trainer/clients/$id" params={{ id: focusClient.id }}>
            Profilo Completo
          </Link>
        </Button>
      </div>

      <div className={`${cardClass} p-4`}>
        {phoneDigits ? (
          <a
            href={`https://wa.me/${phoneDigits}`}
            target="_blank"
            rel="noreferrer"
            className="w-full min-h-11 bg-brand-whatsapp/10 text-on-brand-whatsapp border border-brand-whatsapp/30 text-sm font-semibold py-3 rounded-full flex items-center justify-center gap-2 hover:bg-brand-whatsapp/20 transition-colors"
          >
            <MessageCircle className="size-4" /> Messaggio WhatsApp
          </a>
        ) : (
          <button
            disabled
            className="w-full min-h-11 bg-surface-container-low text-outline border border-surface-variant text-sm font-semibold py-3 rounded-full flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
          >
            <MessageCircle className="size-4" /> Numero non disponibile
          </button>
        )}
      </div>

      <div className={`${cardClass} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-label-sm uppercase tracking-wider font-bold text-on-surface">
            Note Ultima Sessione
          </h5>
          {lastNote?.scheduled_at && (
            <span className="text-label-sm text-outline">
              {new Date(lastNote.scheduled_at).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "long",
              })}
            </span>
          )}
        </div>
        <div className="bg-surface p-4 rounded-2xl">
          {isLoadingNote ? (
            <p className="text-sm text-outline">Caricamento…</p>
          ) : lastNote?.trainer_notes ? (
            <p className="text-sm text-on-surface-variant italic leading-relaxed">
              "{lastNote.trainer_notes}"
            </p>
          ) : (
            <p className="text-sm text-outline italic">Nessuna nota disponibile.</p>
          )}
        </div>
      </div>
    </>
  );
}
