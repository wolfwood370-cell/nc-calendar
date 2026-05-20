// ----------------------------------------------------------------------------
// AuraSkeleton — Aura Health System loading placeholders.
// ----------------------------------------------------------------------------
// Three opinions baked in:
//   1. Soft pulse on `bg-surface-container-high/40` — gentle enough not to
//      compete with real content fading in, but visible against the
//      bg-background canvas.
//   2. Aura shape vocabulary: cards take rounded-[32px], avatars / pills /
//      chips / buttons take fully tondo rounded-full. The variant components
//      below enforce this so call sites never have to remember the token.
//   3. Animation runs via Tailwind's `animate-pulse` so the GPU compositor
//      handles it (transform/opacity only). No layout thrash.
//
// Variants:
//   <AuraSkeleton />          generic base; pass className for custom shapes
//   <AuraCardSkeleton />      full card placeholder
//   <AuraPillSkeleton />      pill / chip / button placeholder
//   <AuraAvatarSkeleton />    circular avatar (sm/md/lg)
//   <AuraLineSkeleton />      single text-line placeholder
//
// Composition example (mobile dashboard "Sessioni di oggi"):
//   <AuraCardSkeleton className="h-24 flex items-center gap-4 p-4">
//     <AuraAvatarSkeleton size="md" />
//     <div className="flex-1 flex flex-col gap-2">
//       <AuraLineSkeleton className="w-2/3" />
//       <AuraLineSkeleton className="w-1/3 h-3" />
//     </div>
//   </AuraCardSkeleton>
// ----------------------------------------------------------------------------

import * as React from "react";
import { cn } from "@/lib/utils";

const BASE = "animate-pulse bg-surface-container-high/40";

export function AuraSkeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(BASE, className)} {...props} />;
}

interface AuraCardSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional fixed height. Defaults to h-32 if no children given. */
  height?: string;
}

export function AuraCardSkeleton({
  className,
  height,
  children,
  ...props
}: AuraCardSkeletonProps) {
  return (
    <div
      className={cn(
        BASE,
        "rounded-[32px] border border-outline-variant/20",
        // Default height only kicks in when the consumer doesn't pass
        // children — the children dictate intrinsic height otherwise.
        !children && (height ?? "h-32"),
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface AuraPillSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind width/height utility class, e.g. "w-24 h-10". */
  size?: string;
}

export function AuraPillSkeleton({
  className,
  size = "w-24 h-8",
  ...props
}: AuraPillSkeletonProps) {
  return <div className={cn(BASE, "rounded-full", size, className)} {...props} />;
}

type AvatarSize = "sm" | "md" | "lg";
const AVATAR_SIZE: Record<AvatarSize, string> = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

interface AuraAvatarSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: AvatarSize;
}

export function AuraAvatarSkeleton({
  className,
  size = "md",
  ...props
}: AuraAvatarSkeletonProps) {
  return (
    <div
      className={cn(BASE, "rounded-full shrink-0", AVATAR_SIZE[size], className)}
      {...props}
    />
  );
}

export function AuraLineSkeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(BASE, "rounded-full h-4 w-full", className)} {...props} />;
}
