// Sync forzato sull'intero anno corrente (prima in cima al Calendario; dalla
// passata 04 sul desktop sta in Integrazioni, sul telefono resta dov'era).

import { Button } from "@/components/ui/button";
import { useGcalForceSync } from "@/hooks/use-gcal-sync";

export function GcalFullSyncButton({
  coachId,
  onSynced,
}: {
  coachId: string | undefined;
  onSynced?: () => void;
}) {
  const { forceSyncing, runForceSync } = useGcalForceSync(coachId, onSynced);
  return (
    <div className="mt-2 mb-3 flex items-center justify-end">
      <Button
        variant="outline"
        size="sm"
        onClick={runForceSync}
        disabled={forceSyncing}
        className="gap-2"
      >
        {forceSyncing
          ? "Sincronizzazione…"
          : `Sincronizza tutto dal 1° gen ${new Date().getFullYear()}`}
      </Button>
    </div>
  );
}
