import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPwaButton({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!isMobile || installed || !evt) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className={className}
      onClick={async () => {
        await evt.prompt();
        const { outcome } = await evt.userChoice;
        if (outcome === "accepted") setEvt(null);
      }}
    >
      <Download className="size-4" /> Installa l'App
    </Button>
  );
}
