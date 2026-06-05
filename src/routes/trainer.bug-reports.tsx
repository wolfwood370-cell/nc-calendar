// ----------------------------------------------------------------------------
// /trainer/bug-reports — dashboard delle segnalazioni manuali utenti.
// ----------------------------------------------------------------------------
// Le segnalazioni arrivano dalla tabella public.bug_reports (popolata dal
// FAB "Segnala problema" in tutta l'app). RLS garantisce che il coach
// veda solo i propri report + quelli dei propri clienti, l'admin tutto.
//
// Feature chiave:
//   - tab filtri stato (aperti / in corso / risolti)
//   - badge severità con colori coerenti (low=outline, medium=secondary, high=destructive)
//   - dettaglio in Sheet con tutte le info tecniche + "Copia per Claude"
//     che formatta il report in un blocco markdown pronto da incollare in chat
//   - realtime subscription: nuovi report appaiono live senza refresh
//   - mutation per cambiare status (open ↔ in_progress ↔ resolved)
// ----------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bug, Copy, ExternalLink, Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trainer/bug-reports")({
  component: BugReportsPage,
});

type Severity = "low" | "medium" | "high";
type Status = "open" | "in_progress" | "resolved";

interface BugReportRow {
  id: string;
  reporter_id: string;
  reporter_role: "coach" | "client" | "admin";
  coach_id: string | null;
  severity: Severity;
  description: string;
  page_url: string | null;
  user_agent: string | null;
  sentry_event_id: string | null;
  status: Status;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// Relaxed client shim — `bug_reports` non è ancora nei tipi generati
// Supabase finché Lovable non rigenera post-migration 20260526140000.
// Stesso pattern usato in use-current-block.ts (ensure_client_block_state).
interface RelaxedBugReportsClient {
  from: (table: "bug_reports") => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => {
        limit: (n: number) => Promise<{
          data: BugReportRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (input: { status: Status }) => {
      eq: (col: "id", val: string) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };
}

interface BugReportWithReporter extends BugReportRow {
  reporter_name: string | null;
  reporter_email: string | null;
}

const STATUS_LABELS: Record<Status, string> = {
  open: "Aperto",
  in_progress: "In corso",
  resolved: "Risolto",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
};

function severityBadgeVariant(s: Severity): "outline" | "secondary" | "destructive" {
  if (s === "high") return "destructive";
  if (s === "medium") return "secondary";
  return "outline";
}

// N9: paginazione semplice — 100 righe iniziali, "Carica altri" raddoppia
// fino a un cap di sicurezza (1000) per evitare query abusive.
const PAGE_SIZE = 100;
const MAX_ROWS = 1000;

function BugReportsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Status>("open");
  const [selected, setSelected] = useState<BugReportWithReporter | null>(null);
  const [pageLimit, setPageLimit] = useState<number>(PAGE_SIZE);

  // Fetch reports + reporter profile in 2 query (no .join JS-side perché
  // RLS è scoped sul coach via policy). Il join è fatto in memoria.
  const reportsQ = useQuery({
    queryKey: ["bug-reports", user?.id, pageLimit],
    enabled: !!user,
    queryFn: async (): Promise<BugReportWithReporter[]> => {
      const sb = supabase as unknown as RelaxedBugReportsClient;
      const { data, error } = await sb
        .from("bug_reports")
        .select(
          "id, reporter_id, reporter_role, coach_id, severity, description, page_url, user_agent, sentry_event_id, status, resolved_at, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(pageLimit);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const reporterIds = Array.from(new Set(rows.map((r) => r.reporter_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", reporterIds);
      const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
      for (const p of profiles ?? []) {
        profileMap.set(p.id as string, {
          full_name: (p as { full_name: string | null }).full_name,
          email: (p as { email: string | null }).email,
        });
      }
      return rows.map((r) => ({
        ...r,
        reporter_name: profileMap.get(r.reporter_id)?.full_name ?? null,
        reporter_email: profileMap.get(r.reporter_id)?.email ?? null,
      }));
    },
  });

  // NB: la lista NON si aggiorna in realtime. La tabella bug_reports è stata
  // rimossa dalla publication supabase_realtime (migration 20260527075437)
  // per motivi di sicurezza, quindi una subscription postgres_changes non
  // riceverebbe mai eventi. L'aggiornamento avviene via refetch (pulsante
  // manuale / navigazione).

  const updateStatus = useMutation({
    mutationFn: async (input: { id: string; status: Status }) => {
      const sb = supabase as unknown as RelaxedBugReportsClient;
      const { error } = await sb
        .from("bug_reports")
        .update({ status: input.status })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Stato aggiornato.");
      qc.invalidateQueries({ queryKey: ["bug-reports", user?.id] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      toast.error("Errore aggiornamento stato.", { description: msg });
    },
  });

  const all = reportsQ.data ?? [];
  const byStatus = useMemo(() => {
    const buckets: Record<Status, BugReportWithReporter[]> = {
      open: [],
      in_progress: [],
      resolved: [],
    };
    for (const r of all) buckets[r.status].push(r);
    return buckets;
  }, [all]);

  return (
    <div className="min-h-screen bg-surface -m-4 md:-m-6 p-6 md:p-10 space-y-8">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-primary flex items-center gap-3">
            <Bug className="size-8" /> Segnalazioni
          </h1>
          <p className="text-base text-muted-foreground mt-2">
            I problemi segnalati dai tuoi clienti tramite il pulsante "Segnala problema".
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => reportsQ.refetch()}
          disabled={reportsQ.isRefetching}
          className="rounded-full"
        >
          {reportsQ.isRefetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Aggiorna
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
        <TabsList className="rounded-full">
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <TabsTrigger key={s} value={s} className="rounded-full">
              {STATUS_LABELS[s]}{" "}
              <span className="ml-2 text-xs opacity-70 tabular-nums">
                ({byStatus[s].length})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
          <TabsContent key={s} value={s} className="mt-6">
            {reportsQ.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : byStatus[s].length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bug className="size-12 mx-auto mb-3 opacity-30" />
                <p>Nessuna segnalazione {STATUS_LABELS[s].toLowerCase()}.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {byStatus[s].map((r) => (
                  <BugReportCard
                    key={r.id}
                    report={r}
                    onClick={() => setSelected(r)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {all.length >= pageLimit && pageLimit < MAX_ROWS && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => setPageLimit((n) => Math.min(MAX_ROWS, n * 2))}
            disabled={reportsQ.isFetching}
          >
            {reportsQ.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Carica altre segnalazioni
          </Button>
        </div>
      )}

      <BugReportDetailSheet
        report={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onStatusChange={(status) =>
          selected && updateStatus.mutate({ id: selected.id, status })
        }
        statusUpdating={updateStatus.isPending}
      />
    </div>
  );
}

function BugReportCard({
  report,
  onClick,
}: {
  report: BugReportWithReporter;
  onClick: () => void;
}) {
  const dateLabel = new Date(report.created_at).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const reporterLabel =
    report.reporter_name ?? report.reporter_email ?? "Utente sconosciuto";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl bg-white border border-outline-variant/40 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-4 hover:border-aura-primary/40 transition-colors active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={severityBadgeVariant(report.severity)} className="rounded-full">
            {SEVERITY_LABELS[report.severity]}
          </Badge>
          <span className="text-xs text-on-surface-variant">
            {reporterLabel}
            {report.reporter_role !== "client" && (
              <span className="ml-1 text-[10px] uppercase tracking-wider">
                ({report.reporter_role})
              </span>
            )}
          </span>
        </div>
        <span className="text-xs text-on-surface-variant tabular-nums shrink-0">
          {dateLabel}
        </span>
      </div>
      <p className="text-sm text-on-surface line-clamp-2 mb-1">{report.description}</p>
      {report.page_url && (
        <p className="text-[11px] text-on-surface-variant font-mono truncate">
          {report.page_url}
        </p>
      )}
    </button>
  );
}

function BugReportDetailSheet({
  report,
  onOpenChange,
  onStatusChange,
  statusUpdating,
}: {
  report: BugReportWithReporter | null;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (status: Status) => void;
  statusUpdating: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyForClaude() {
    if (!report) return;
    const md = formatReportForClaude(report);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      toast.success("Copiato negli appunti.", {
        description: "Incollalo direttamente in chat con Claude.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossibile copiare. Selezione manuale.");
    }
  }

  return (
    <Sheet open={!!report} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
        {report && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Bug className="size-5" />
                Dettaglio segnalazione
              </SheetTitle>
              <SheetDescription>
                Tutte le informazioni tecniche per riprodurre e risolvere il problema.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              <Section title="Descrizione">
                <p className="text-sm text-on-surface whitespace-pre-wrap">
                  {report.description}
                </p>
              </Section>

              <Section title="Reporter">
                <p className="text-sm">
                  {report.reporter_name ?? "—"}{" "}
                  <span className="text-on-surface-variant">
                    ({report.reporter_email ?? "—"})
                  </span>
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  Ruolo: <span className="font-semibold">{report.reporter_role}</span>
                </p>
              </Section>

              <div className="grid grid-cols-2 gap-3">
                <Section title="Gravità">
                  <Badge
                    variant={severityBadgeVariant(report.severity)}
                    className="rounded-full"
                  >
                    {SEVERITY_LABELS[report.severity]}
                  </Badge>
                </Section>
                <Section title="Stato">
                  <Badge variant="outline" className="rounded-full">
                    {STATUS_LABELS[report.status]}
                  </Badge>
                </Section>
              </div>

              <Section title="Pagina">
                <code className="text-xs bg-surface-container-low rounded-md px-2 py-1 break-all">
                  {report.page_url ?? "—"}
                </code>
              </Section>

              <Section title="Browser">
                <code className="text-[10px] bg-surface-container-low rounded-md px-2 py-1 break-all block">
                  {report.user_agent ?? "—"}
                </code>
              </Section>

              <Section title="Segnalato il">
                <p className="text-sm tabular-nums">
                  {new Date(report.created_at).toLocaleString("it-IT", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </p>
              </Section>

              {report.sentry_event_id && (
                <Section title="Sentry">
                  <code className="text-[11px] bg-surface-container-low rounded-md px-2 py-1 break-all flex items-center gap-2">
                    <ExternalLink className="size-3 shrink-0" />
                    {report.sentry_event_id}
                  </code>
                </Section>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-4 border-t border-outline-variant/40">
                <Button
                  type="button"
                  onClick={copyForClaude}
                  className={cn(
                    "rounded-full text-on-primary",
                    copied ? "bg-aura-secondary" : "bg-aura-primary hover:opacity-90",
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="size-4" />
                      Copiato!
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                      Copia per Claude
                    </>
                  )}
                </Button>

                <div className="flex gap-2">
                  {(Object.keys(STATUS_LABELS) as Status[])
                    .filter((s) => s !== report.status)
                    .map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onStatusChange(s)}
                        disabled={statusUpdating}
                        className="rounded-full flex-1"
                      >
                        Sposta a "{STATUS_LABELS[s]}"
                      </Button>
                    ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * Formatta il report come blocco markdown pronto da incollare in chat con
 * Claude. Include solo le info che servono per il debug: descrizione,
 * reporter info, pagina, browser, severity, timestamp, sentry id.
 */
function formatReportForClaude(r: BugReportWithReporter): string {
  const lines = [
    `# Bug Report — ${SEVERITY_LABELS[r.severity]}`,
    "",
    `**Descrizione**:`,
    r.description,
    "",
    `**Reporter**: ${r.reporter_name ?? "—"} (${r.reporter_email ?? "—"}) — ruolo: ${r.reporter_role}`,
    `**Pagina**: \`${r.page_url ?? "—"}\``,
    `**Browser**: \`${r.user_agent ?? "—"}\``,
    `**Segnalato il**: ${new Date(r.created_at).toLocaleString("it-IT")}`,
    `**Stato**: ${STATUS_LABELS[r.status]}`,
  ];
  if (r.sentry_event_id) {
    lines.push(`**Sentry event id**: \`${r.sentry_event_id}\``);
  }
  return lines.join("\n");
}
