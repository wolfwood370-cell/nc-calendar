// ----------------------------------------------------------------------------
// Menu ⋮ della scheda e della riga cliente (audit L6, passata 05)
// ----------------------------------------------------------------------------
// «Apri profilo» · «Archivia»/«Ripristina» (immediato, toast con «Ripristina»)
// · separatore · «Elimina…» in rosso, che apre la conferma. Il clic e i tasti
// sul menu non arrivano alla scheda, che altrimenti aprirebbe il profilo.
// ----------------------------------------------------------------------------

import { Archive, ArchiveRestore, MoreVertical, Trash2, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ITEM = "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-sm";

export function ClientRowMenu({
  archived,
  onOpen,
  onArchive,
  onDelete,
}: {
  archived: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="contents"
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Altre azioni"
            className="grid size-[34px] place-items-center rounded-full text-outline transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            <MoreVertical className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[200px] rounded-2xl border-surface-container p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
        >
          <DropdownMenuItem className={ITEM} onSelect={onOpen}>
            <User className="size-[15px] text-on-surface-variant" aria-hidden />
            Apri profilo
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={onArchive}>
            {archived ? (
              <ArchiveRestore className="size-[15px] text-on-surface-variant" aria-hidden />
            ) : (
              <Archive className="size-[15px] text-on-surface-variant" aria-hidden />
            )}
            {archived ? "Ripristina" : "Archivia"}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1 bg-surface-container" />
          <DropdownMenuItem
            className={`${ITEM} text-danger-text focus:bg-danger-soft focus:text-danger-text`}
            onSelect={onDelete}
          >
            <Trash2 className="size-[15px]" aria-hidden />
            Elimina…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
