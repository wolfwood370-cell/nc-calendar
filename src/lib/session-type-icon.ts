import { Dumbbell, Sparkles, Stethoscope, Scale, Phone, type LucideIcon } from "lucide-react";

/**
 * Restituisce l'icona lucide più appropriata per il nome di un session_type
 * o event_type. Usa pattern matching case-insensitive sul nome.
 * Ordine di valutazione importante: i match più specifici prima dei più
 * generici (es. "bia" prima di "test", così "BIA" non finisce sotto
 * "test funzionali").
 *
 *   - "bia" / "bioimpedenz"          → Scale       (bilancia / composizione corporea)
 *   - "call" / "consulenza" / "videocall" → Phone   (chiamata / consulenza remota)
 *   - "triage" / "test" / "fms"      → Stethoscope (assessment funzionale)
 *   - "massa" / "spa"                → Sparkles    (massaggio / SPA)
 *   - default                        → Dumbbell    (training)
 */
export function iconForType(name: string | undefined): LucideIcon {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bia") || n.includes("bioimpedenz")) return Scale;
  if (n.includes("call") || n.includes("consulenza") || n.includes("videocall")) return Phone;
  if (n.includes("triage") || n.includes("test") || n.includes("fms")) return Stethoscope;
  if (n.includes("massa") || n.includes("spa")) return Sparkles;
  return Dumbbell;
}
