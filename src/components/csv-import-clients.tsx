import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, FileUp, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendInvitationEmail } from "@/lib/email";
import { toast } from "sonner";

interface Row { full_name: string; email: string; phone: string; }
interface Result { row: Row; status: "created" | "exists" | "error"; message?: string; }

function parseCSV(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  // Detect header row
  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("email") || header.includes("name") || header.includes("nome");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  // Simple CSV split (no quoted commas support — sufficient for typical contact exports)
  const cols = hasHeader ? lines[0].split(",").map((c) => c.trim().toLowerCase()) : ["full_name", "email", "phone"];
  const idxName = cols.findIndex((c) => c.includes("name") || c.includes("nome"));
  const idxEmail = cols.findIndex((c) => c.includes("email") || c.includes("mail"));
  const idxPhone = cols.findIndex((c) => c.includes("phone") || c.includes("tel"));
  return dataLines.map((line) => {
    const parts = line.split(",").map((p) => p.trim());
    return {
      full_name: (idxName >= 0 ? parts[idxName] : parts[0]) ?? "",
      email: (idxEmail >= 0 ? parts[idxEmail] : parts[1]) ?? "",
      phone: (idxPhone >= 0 ? parts[idxPhone] : parts[2]) ?? "",
    };
  }).filter((r) => r.email.includes("@"));
}

export function CsvImportClients({ coachId, coachName, onDone }: { coachId: string; coachName: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCSV(text);
    setRows(parsed);
    setResults([]);
    if (parsed.length === 0) {
      toast.error("CSV vuoto o non valido", { description: "Controlla che sia presente una colonna 'email'." });
    }
  };

  const runImport = async () => {
    setRunning(true);
    const out: Result[] = [];
    for (const row of rows) {
      const email = row.email.toLowerCase().trim();
      try {
        // 1. Esiste già un profilo con questa email per questo coach?
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .eq("coach_id", coachId)
          .maybeSingle();
        if (existingProfile) {
          out.push({ row, status: "exists", message: "Cliente già presente" });
          continue;
        }
        // 2. Esiste già un invito pending?
        const { data: existingInv } = await supabase
          .from("client_invitations")
          .select("id, status")
          .ilike("email", email)
          .eq("coach_id", coachId)
          .maybeSingle();
        if (existingInv && existingInv.status === "pending") {
          out.push({ row, status: "exists", message: "Invito già in attesa" });
          continue;
        }
        // 3. Crea invito (placeholder finché il cliente non si registra)
        const { error: invErr } = await supabase.from("client_invitations").insert({
          email, full_name: row.full_name || null, phone: row.phone || null, coach_id: coachId,
        });
        if (invErr) {
          out.push({ row, status: "error", message: invErr.message });
          continue;
        }
        // 4. Email di invito (best-effort)
        await sendInvitationEmail({ to: email, clientName: row.full_name, coachName }).catch(() => {});
        out.push({ row, status: "created" });
      } catch (e) {
        out.push({ row, status: "error", message: e instanceof Error ? e.message : "Errore" });
      }
    }
    setResults(out);
    setRunning(false);
    const created = out.filter((r) => r.status === "created").length;
    toast.success(`${created} ${created === 1 ? "invito creato" : "inviti creati"}`, {
      description: `${out.filter((r) => r.status === "exists").length} già presenti, ${out.filter((r) => r.status === "error").length} errori.`,
    });
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setRows([]); setResults([]); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="size-4" /> Importa Clienti</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importa clienti da CSV</DialogTitle>
          <DialogDescription>
            Il file deve contenere le colonne <code>full_name</code>, <code>email</code>, <code>phone</code>. Per ogni riga
            verrà creato un invito; se l'email esiste già, la riga viene saltata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <FileUp className="size-8 mx-auto text-muted-foreground mb-2" />
            <input
              ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>Seleziona file CSV</Button>
            {rows.length > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                {rows.length} {rows.length === 1 ? "riga rilevata" : "righe rilevate"}
              </p>
            )}
          </div>

          {rows.length > 0 && results.length === 0 && (
            <div className="max-h-60 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr><th className="text-left p-2">Nome</th><th className="text-left p-2">Email</th><th className="text-left p-2">Telefono</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t"><td className="p-2">{r.full_name || "—"}</td><td className="p-2">{r.email}</td><td className="p-2">{r.phone || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {results.length > 0 && (
            <div className="max-h-60 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        {r.status === "created" && <CheckCircle2 className="size-4 text-success inline" />}
                        {r.status === "exists" && <AlertCircle className="size-4 text-muted-foreground inline" />}
                        {r.status === "error" && <AlertCircle className="size-4 text-destructive inline" />}
                      </td>
                      <td className="p-2">{r.row.email}</td>
                      <td className="p-2 text-muted-foreground">{r.message ?? (r.status === "created" ? "Invito creato" : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={runImport} disabled={rows.length === 0 || running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importa {rows.length > 0 && `(${rows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
