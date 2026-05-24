import { UserSearch } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FocusClientPanel } from "@/components/focus-client-panel";
import type { ComponentProps } from "react";

/** Props del FocusClientPanel riutilizzate per disaccoppiare i types. */
type FocusPanelProps = ComponentProps<typeof FocusClientPanel>;

export interface CalendarContextPanelProps {
  /** Cliente attualmente "in focus" (null = nessuno selezionato). */
  focusClient: FocusPanelProps["focusClient"];
  /** ID del focus client per gating + reset Sheet. */
  focusClientId: string | null;
  /** True mentre la query clients sta caricando (mostra skeleton in panel). */
  isClientsLoading: boolean;
  /** Ultima nota visibile per il cliente in focus (null se nessuna o non caricata). */
  lastNote: FocusPanelProps["lastNote"];
  /** True mentre la query lastNote sta caricando. */
  isNoteLoading: boolean;
  /** True quando il breakpoint è sotto xl (mostra Sheet invece dell'aside). */
  isBelowXl: boolean;
  /** Callback per chiudere il Sheet (parent resetta focusClientId). */
  onCloseFocus: () => void;
}

/**
 * Pannello "Focus Cliente" del coach calendar. Renderizza il content
 * in due modi diversi in base al breakpoint:
 *
 *   - xl+ (desktop): `<aside>` sticky a destra sempre visibile
 *   - < xl (tablet/mobile): `<Sheet>` slide-in da destra, aperto quando
 *     focusClientId è settato
 *
 * Il content interno (FocusClientPanel) è identico nei due casi —
 * questo wrapper deduplica i 50 righe di JSX che prima vivevano
 * separate nel route file.
 */
export function CalendarContextPanel({
  focusClient,
  focusClientId,
  isClientsLoading,
  lastNote,
  isNoteLoading,
  isBelowXl,
  onCloseFocus,
}: CalendarContextPanelProps) {
  const panel = (
    <FocusClientPanel
      focusClient={focusClient}
      focusClientId={focusClientId}
      isLoading={isClientsLoading}
      lastNote={lastNote}
      isLoadingNote={isNoteLoading}
    />
  );

  return (
    <>
      {/* CONTEXT PANEL — desktop only (xl+) */}
      <aside className="hidden xl:flex flex-col w-80 border-l border-surface-variant bg-surface sticky top-0 h-screen">
        <div className="p-6 border-b border-surface-variant bg-white/50 backdrop-blur-md">
          <h3 className="text-lg font-bold text-aura-primary flex items-center gap-2">
            <UserSearch className="size-5" /> Focus Cliente
          </h3>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">{panel}</div>
      </aside>

      {/* MOBILE SHEET — only below xl. Same content as the aside above. */}
      <Sheet
        open={isBelowXl && !!focusClientId}
        onOpenChange={(open) => {
          if (!open) onCloseFocus();
        }}
      >
        <SheetContent
          side="right"
          className="bg-surface-container-lowest w-full sm:max-w-md rounded-l-[32px] border-l-0 p-0 flex flex-col gap-0"
        >
          <SheetHeader className="p-6 border-b border-outline-variant/30 bg-surface-container-lowest/80 backdrop-blur-md text-left space-y-0">
            <SheetTitle className="text-lg font-bold text-aura-primary flex items-center gap-2">
              <UserSearch className="size-5" /> Focus Cliente
            </SheetTitle>
          </SheetHeader>
          <div className="p-6 overflow-y-auto flex-1 space-y-4">{panel}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
