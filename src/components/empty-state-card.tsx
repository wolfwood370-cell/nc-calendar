import { Link } from "@tanstack/react-router";
import { Sparkles, type LucideIcon } from "lucide-react";

interface EmptyStateCardProps {
  title: string;
  description: string;
  ctaLabel: string;
  ctaTo: string;
  icon?: LucideIcon;
}

/**
 * Aura premium empty state — 32px rounded glass card with a motivational
 * headline, a short subtitle and a solid pill CTA. Used wherever a client
 * has no credits / no active path and we want to nudge them to the store.
 */
export function EmptyStateCard({
  title,
  description,
  ctaLabel,
  ctaTo,
  icon: Icon = Sparkles,
}: EmptyStateCardProps) {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-outline-variant/30 bg-surface-container-lowest p-8 text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-aura-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-aura-secondary/10 blur-3xl" />
      <div className="relative flex flex-col items-center gap-4">
        <div className="grid size-14 place-items-center rounded-full bg-primary-container text-on-primary-container">
          <Icon className="size-7" />
        </div>
        <h3 className="font-display text-xl font-semibold text-on-surface">{title}</h3>
        <p className="max-w-sm text-sm text-on-surface-variant">{description}</p>
        <Link
          to={ctaTo}
          className="mt-2 inline-flex items-center justify-center rounded-full bg-primary-container px-7 py-3 text-sm font-semibold text-on-primary shadow-md transition-transform active:scale-95 hover:opacity-95"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
