import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/lib/mock-data";

export function statusItalianLabel(s: BookingStatus): string {
  switch (s) {
    case "scheduled": return "In programma";
    case "completed": return "Completato";
    case "cancelled": return "Annullato";
    case "late_cancelled": return "Cancellazione tardiva";
    case "no_show": return "No Show";
  }
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const label = statusItalianLabel(status);
  switch (status) {
    case "scheduled":
      return <Badge>{label}</Badge>;
    case "completed":
      return (
        <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
          {label}
        </Badge>
      );
    case "cancelled":
      return <Badge variant="outline">{label}</Badge>;
    case "late_cancelled":
    case "no_show":
      return <Badge variant="destructive">{label}</Badge>;
  }
}
