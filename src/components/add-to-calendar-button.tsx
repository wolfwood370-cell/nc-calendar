import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildGoogleCalendarUrl, type CalendarEventParams } from "@/lib/calendar";

interface Props extends CalendarEventParams {
  size?: "sm" | "default";
  variant?: "ghost" | "outline" | "default" | "secondary";
  label?: string;
}

export function AddToCalendarButton({
  size = "sm",
  variant = "outline",
  label = "Aggiungi al Calendario",
  ...event
}: Props) {
  const href = buildGoogleCalendarUrl(event);
  return (
    <Button asChild size={size} variant={variant}>
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
        <CalendarPlus className="size-4" />
        <span className="hidden sm:inline">{label}</span>
      </a>
    </Button>
  );
}
