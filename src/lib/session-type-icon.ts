import { Dumbbell, Sparkles, Stethoscope, type LucideIcon } from "lucide-react";

/**
 * Restituisce l'icona lucide più appropriata per il nome di un session_type
 * o event_type. Usa pattern matching case-insensitive sul nome:
 *   - "triage" / "bia" / "test" → Stethoscope (assessment fisico)
 *   - "massa" / "spa"           → Sparkles    (massaggio / SPA)
 *   - default                   → Dumbbell    (training)
 */
export function iconForType(name: string | undefined): LucideIcon {
  const n = (name ?? "").toLowerCase();
  if (n.includes("triage") || n.includes("bia") || n.includes("test")) return Stethoscope;
  if (n.includes("massa") || n.includes("spa")) return Sparkles;
  return Dumbbell;
}
