// ----------------------------------------------------------------------------
// BugReportFAB — pulsante floating "Segnala problema" disponibile in tutta l'app.
// ----------------------------------------------------------------------------
// Apre un Dialog dove l'utente descrive un problema (testo libero italiano)
// e sceglie la severità. Al submit:
//   1. INSERT in public.bug_reports (RLS + trigger derivano reporter_id,
//      reporter_role, coach_id server-side — il client non può spoof).
//   2. Sentry.captureMessage con tag manual=true → ritorna sentry_event_id,
//      salvato sulla riga per linkare i 2 sistemi nel trainer dashboard.
//   3. Toast successo + chiusura dialog.
//
// Posizionamento: bottom-left fisso. Z-index 40 (sotto Toaster=50 ma sopra
// la maggior parte del contenuto). Bottom calcolato con safe-area-inset
// + 88px su mobile (sopra la bottom nav) → 24px su desktop md+.
//
// Visibilità: nascosto se l'utente non è loggato (no FAB nelle pagine
// auth/). Il root layout decide dove montarlo.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { Bug, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { captureMessage } from "@/lib/sentry";

type Severity = "low" | "medium" | "high";

// Relaxed client shim — `bug_reports` non è ancora nei tipi generati
// Supabase finché Lovable non rigenera post-migration 20260526140000.
// Stesso pattern usato in use-current-block.ts.
interface RelaxedBugReportsInsert {
  from: (table: "bug_reports") => {
    insert: (input: {
      description: string;
      severity: Severity;
      page_url: string;
      user_agent: string;
      sentry_event_id: string | null;
    }) => Promise<{ error: { message: string } | null }>;
  };
}

const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Bassa — fastidio minore",
  medium: "Media — funziona male",
  high: "Alta — non funziona affatto",
};

export function BugReportFAB() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setDescription("");
    setSeverity("medium");
    setSubmitting(false);
  }

  async function handleSubmit() {
    const trimmed = description.trim();
    if (trimmed.length < 5) {
      toast.error("Descrizione troppo corta (almeno 5 caratteri).");
      return;
    }
    if (trimmed.length > 2000) {
      toast.error("Descrizione troppo lunga (massimo 2000 caratteri).");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Sentry first — vogliamo sempre l'evento Sentry, anche se l'INSERT
      //    DB fallisce per RLS / network. L'id ritornato verrà allegato
      //    all'INSERT come link tra i 2 sistemi.
      const sentryEventId = captureMessage(`[manual report] ${trimmed.slice(0, 120)}`, {
        level: severity === "high" ? "error" : severity === "medium" ? "warning" : "info",
        tags: {
          manual: "true",
          severity,
          page_url: window.location.pathname,
        },
        extra: {
          description: trimmed,
        },
      });

      // 2. INSERT in bug_reports. Il trigger BEFORE INSERT deriva
      //    reporter_id/role/coach_id da auth.uid() — non passiamo nulla.
      const sb = supabase as unknown as RelaxedBugReportsInsert;
      const { error } = await sb.from("bug_reports").insert({
        description: trimmed,
        severity,
        page_url: window.location.pathname,
        user_agent: navigator.userAgent.slice(0, 500),
        sentry_event_id: sentryEventId ?? null,
      });

      if (error) {
        console.error("bug-report INSERT failed:", error);
        toast.error("Errore durante l'invio della segnalazione.", {
          description: "Riprova tra qualche istante.",
        });
        return;
      }

      toast.success("Segnalazione inviata.", {
        description: "Grazie! Verrai contattato se servirà altro.",
      });
      setOpen(false);
      reset();
    } catch (e) {
      console.error("bug-report submit error:", e);
      toast.error("Errore imprevisto.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Segnala un problema"
          title="Segnala un problema"
          // Bottom-left fisso. Su mobile è sopra la bottom nav (88px +
          // safe-area). Su desktop md+ si avvicina al bordo.
          className="fixed left-4 z-40 size-12 rounded-full bg-aura-primary text-on-primary shadow-lg hover:opacity-90 transition active:scale-95 flex items-center justify-center md:left-6 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] md:bottom-6"
        >
          <Bug className="size-5" aria-hidden />
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px] rounded-[24px]">
        <DialogHeader>
          <DialogTitle>Segnala un problema</DialogTitle>
          <DialogDescription>
            Descrivi cosa non funziona come ti aspetti. Verrà inviato al tuo coach insieme alle
            informazioni tecniche utili per risolverlo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bug-description">Descrizione</Label>
            <Textarea
              id="bug-description"
              placeholder="Es. Cliccando su 'Prenota Nuova Sessione' il calendario rimane vuoto."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={2000}
              disabled={submitting}
              className="resize-none"
            />
            <span className="text-xs text-on-surface-variant tabular-nums self-end">
              {description.length} / 2000
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Gravità</Label>
            <RadioGroup
              value={severity}
              onValueChange={(v) => setSeverity(v as Severity)}
              disabled={submitting}
              className="flex flex-col gap-2"
            >
              {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
                <Label
                  key={s}
                  htmlFor={`sev-${s}`}
                  className="flex items-center gap-2 rounded-2xl border border-outline-variant/40 px-3 py-2 cursor-pointer hover:bg-surface-container-low"
                >
                  <RadioGroupItem value={s} id={`sev-${s}`} />
                  <span className="text-sm">{SEVERITY_LABELS[s]}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="rounded-full"
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || description.trim().length < 5}
            className="rounded-full bg-aura-primary text-on-primary hover:opacity-90"
          >
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Invia segnalazione
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
