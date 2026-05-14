import { Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BoosterCardProps {
  title: string;
  description: string;
  price?: string;
  perSession?: string;
  expiresAt?: string;
  isOwned?: boolean;
  hero?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export function BoosterCard({
  title,
  description,
  price,
  perSession,
  expiresAt,
  isOwned = false,
  hero = false,
  loading = false,
  disabled = false,
  icon: Icon = Sparkles,
  actionLabel = "Acquista Ora",
  onAction,
}: BoosterCardProps) {
  return (
    <article
      aria-label={isOwned ? `Booster attivo: ${title}` : `Pacchetto: ${title}`}
      className={[
        "relative h-full flex flex-col rounded-[24px] p-6 border transition",
        "bg-white/60 backdrop-blur-xl border-white/40",
        "shadow-[0_8px_30px_rgba(0,0,0,0.04)]",
        isOwned ? "shadow-[inset_0_0_20px_rgba(0,62,98,0.05)]" : "",
        hero && !isOwned ? "ring-1 ring-primary/20" : "",
      ].join(" ")}
    >
      {isOwned && (
        <span className="absolute -top-2 right-6 bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full shadow-sm">
          Disponibile
        </span>
      )}
      {hero && !isOwned && (
        <span className="absolute -top-2 right-6 bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full shadow-sm">
          Miglior Valore
        </span>
      )}

      <div className="flex items-start gap-4 flex-1">
        <div
          aria-hidden
          className={[
            "size-12 shrink-0 rounded-2xl flex items-center justify-center",
            isOwned
              ? "bg-primary/10 text-primary"
              : hero
                ? "bg-primary text-primary-foreground"
                : "bg-surface-container text-on-surface",
          ].join(" ")}
        >
          <Icon className="size-6" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="font-manrope font-semibold text-base leading-snug text-on-surface">
            {title}
          </h3>

          {price && (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-display font-bold text-on-surface">
                {price}
              </span>
              {perSession && (
                <span className="text-xs text-on-surface-variant">
                  {perSession}
                </span>
              )}
            </div>
          )}

          <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
            {description}
          </p>

          {expiresAt && (
            <p className="mt-2 text-xs text-on-surface-variant">
              Scade il{" "}
              <time dateTime={expiresAt}>
                {new Date(expiresAt).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </time>
            </p>
          )}

          {!isOwned && onAction && (
            <Button
              onClick={onAction}
              disabled={disabled || loading}
              aria-label={`${actionLabel} — ${title}`}
              className="mt-4 w-full rounded-full bg-[#0f172a] text-white hover:bg-[#0f172a]/90 border border-white/10 shadow-[0_4px_20px_rgba(15,23,42,0.25)]"
            >
              {loading ? "Attendere..." : actionLabel}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
