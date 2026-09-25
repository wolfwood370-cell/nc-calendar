// ----------------------------------------------------------------------------
// TrainerClientSearch — «Cerca cliente» nell'header coach (audit S2)
// ----------------------------------------------------------------------------
// Combobox ARIA: il focus resta nel campo, frecce su/giù scelgono il
// risultato, Invio apre il profilo, Esc chiude l'elenco. ⌘K / Ctrl+K porta
// il focus qui da qualunque pagina coach. I clienti arrivano da
// useCoachClients (stessa cache di Panoramica e Calendario).
// ----------------------------------------------------------------------------

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCoachClients } from "@/lib/queries";
import { clientPlanLabel, searchClients } from "@/lib/client-search";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

export function TrainerClientSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const clientsQ = useCoachClients(user?.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const results = useMemo(() => searchClients(clientsQ.data ?? [], query), [clientsQ.data, query]);
  const showList = open && query.trim().length > 0;
  const active = Math.min(highlighted, results.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    // In cattura: uno stopPropagation dentro la pagina (es. i menu delle
    // schede clienti) non deve bloccare la scorciatoia.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const openClient = (id: string) => {
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    void navigate({ to: "/trainer/clients/$id", params: { id } });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlighted(Math.max(0, Math.min(results.length - 1, active + step)));
    } else if (e.key === "Enter") {
      const target = results[active];
      if (showList && target) {
        e.preventDefault();
        openClient(target.id);
      }
    } else if (e.key === "Escape") {
      // Primo Esc chiude l'elenco, il secondo svuota il campo.
      if (showList) setOpen(false);
      else setQuery("");
    }
  };

  return (
    <div className="relative min-w-[150px] flex-[0_1_300px]">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-[11px] left-3.5 size-4 text-outline"
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Cerca cliente"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? optionId(active) : undefined}
        aria-keyshortcuts="Meta+K Control+K"
        placeholder="Cerca cliente"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-[38px] w-full rounded-full border border-outline-variant/60 bg-white pr-[52px] pl-[38px] text-sm text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_3px_rgba(0,86,133,0.12)]"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute top-[9px] right-2.5 flex h-5 items-center rounded-[6px] bg-surface-container px-1.5 font-sans text-[11px] font-semibold text-outline"
      >
        ⌘K
      </kbd>

      <div
        id={listId}
        role="listbox"
        aria-label="Clienti trovati"
        hidden={!showList}
        // Il clic su un risultato non deve togliere il focus al campo prima dell'onClick.
        onMouseDown={(e) => e.preventDefault()}
        className="absolute inset-x-0 top-[46px] z-50 flex flex-col rounded-[18px] border border-surface-container bg-white p-1.5 text-on-surface shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
      >
        {results.map((c, i) => (
          <div
            key={c.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            onClick={() => openClient(c.id)}
            onMouseEnter={() => setHighlighted(i)}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-2",
              i === active && "bg-surface-container-low",
            )}
          >
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-avatar-placeholder text-xs font-bold text-on-avatar-placeholder"
            >
              {initials(c.full_name, c.email)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{c.full_name || c.email}</span>
              <span className="truncate text-xs text-outline">{clientPlanLabel(c)}</span>
            </span>
            <ArrowRight aria-hidden className="size-3.5 shrink-0 text-outline" />
          </div>
        ))}
        {results.length === 0 && (
          <p className="px-2.5 py-3.5 text-[13px] text-outline">
            {clientsQ.isLoading
              ? "Caricamento dei clienti…"
              : `Nessun cliente trovato per «${query.trim()}».`}
          </p>
        )}
      </div>
    </div>
  );
}
