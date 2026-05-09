import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";

export function JoinVideoCallButton({
  url,
  size = "sm",
  variant = "default",
}: {
  url: string;
  size?: "sm" | "default";
  variant?: "default" | "secondary" | "outline";
}) {
  return (
    <Button asChild size={size} variant={variant}>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Video className="size-4" /> Partecipa alla Videochiamata
      </a>
    </Button>
  );
}

export function generateMockMeetLink(): string {
  const part = () => Math.random().toString(36).slice(2, 6);
  return `https://meet.google.com/mock-${part()}-${part()}`;
}
