// ----------------------------------------------------------------------------
// AuraProgressRing — SVG circular progress with the Aura look.
// ----------------------------------------------------------------------------
// Brand-blue (#005685) filled track on a soft neutral container, rounded
// stroke caps, and an "X / Y" fractional readout dead-center. When the
// `remaining` value drops at or below `lowThreshold` (default 2) the stroke
// smoothly transitions to a soft alerting token — the same hue Stripe's
// "balance low" callouts use — and the consumer can render a recharge pill
// nearby.
//
// The SVG is rendered at the supplied `size` (in px). Stroke + radius are
// computed off it so the ring looks identical across the 80px dashboard
// avatar variant and the 64px booster-card variant.
//
// All animation lives in stroke-dashoffset which the GPU compositor can
// promote — no layout thrash, no JS animation loop.
// ----------------------------------------------------------------------------

import * as React from "react";
import { cn } from "@/lib/utils";

interface AuraProgressRingProps {
  /** Sessions used so far. Clamped to [0, total]. */
  used: number;
  /** Total assigned sessions for the pack. */
  total: number;
  /** SVG canvas size in pixels (square). Default 88. */
  size?: number;
  /** Stroke width in pixels. Default 8. */
  strokeWidth?: number;
  /** Filled track color (default Aura primary #005685). */
  color?: string;
  /** Alert color used when remaining ≤ lowThreshold. */
  dangerColor?: string;
  /** Trigger value for the alert color swap. Default 2. */
  lowThreshold?: number;
  /** Optional extra class on the root SVG element. */
  className?: string;
  /** Show the X/Y readout in the center (default true). */
  showLabel?: boolean;
  /** Override the inner label (e.g. percentage). Defaults to "used / total". */
  label?: string;
}

export function AuraProgressRing({
  used,
  total,
  size = 88,
  strokeWidth = 8,
  color = "#005685",
  dangerColor = "#c93b3b",
  lowThreshold = 2,
  className,
  showLabel = true,
  label,
}: AuraProgressRingProps) {
  const safeTotal = Math.max(0, total);
  const safeUsed = Math.max(0, Math.min(used, safeTotal));
  const remaining = Math.max(0, safeTotal - safeUsed);
  const pct = safeTotal > 0 ? safeUsed / safeTotal : 0;

  // Geometry: leave half the stroke as padding so the cap doesn't clip.
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);

  const isLow = safeTotal > 0 && remaining > 0 && remaining <= lowThreshold;
  const strokeColor = isLow ? dangerColor : color;
  const readout = label ?? `${safeUsed} / ${safeTotal}`;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeTotal || 1}
      aria-valuenow={safeUsed}
      aria-label={`${safeUsed} di ${safeTotal} sessioni utilizzate`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Rotate so the stroke starts at 12 o'clock and flows clockwise.
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden
      >
        {/* Track — soft neutral, container-tint of the brand. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(0 86 133 / 0.10)"
          strokeWidth={strokeWidth}
        />
        {/* Filled progress with rounded caps. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 360ms cubic-bezier(0.22, 1, 0.36, 1), stroke 240ms ease",
          }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="font-semibold tabular-nums text-on-surface"
            style={{ fontSize: Math.max(11, size * 0.18) }}
          >
            {readout}
          </span>
        </div>
      )}
    </div>
  );
}
