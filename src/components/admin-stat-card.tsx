import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface AdminStatCardProps {
  /** Componente icona lucide renderizzato nel cerchio primary. */
  icon: LucideIcon;
  /** Label superiore (testo descrittivo della stat). */
  label: string;
  /** Valore numerico mostrato in font display 3xl. */
  value: number;
}

/**
 * Card statistica compatta della pagina admin: label + value + icon
 * primary tinto. Estratto da admin.tsx (era function StatCard inline).
 */
export function AdminStatCard({ icon: Icon, label, value }: AdminStatCardProps) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-3xl font-semibold mt-1">{value}</p>
        </div>
        <div className="size-10 rounded-full bg-aura-primary/10 text-aura-primary grid place-items-center">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
