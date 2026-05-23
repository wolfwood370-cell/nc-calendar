// ----------------------------------------------------------------------------
// SwipeableCard — touch swipe wrapper with reveal-style action buttons.
// ----------------------------------------------------------------------------
// Implements the iOS-mail / Linear-style horizontal swipe gesture without
// pulling in framer-motion. The wrapper renders three layers stacked at the
// same position:
//
//     [ Left action pill ]         [ children card ]         [ Right action pill ]
//     (absolutely placed, visible on swipe → / ←)
//
// On pointerdown the inner card listens for x deltas; transform: translate3d
// shifts the card horizontally while resistance kicks in past the reveal
// threshold. Pointer up evaluates:
//
//   |delta| <  REVEAL_PX  → spring back to 0
//   |delta| >= TRIGGER_PX → fire the matching callback, snap closed
//   REVEAL_PX <= |delta| < TRIGGER_PX → hold at REVEAL_PX so the pill is
//                                       fully visible and the user can tap it
//
// Hardware acceleration comes from sticking to transform + will-change.
// Vertical scroll passes through because the handler bails on the first
// move where |dy| > |dx|.
//
// Accessibility: action pills double as real <button>s, so keyboard +
// screen reader users can trigger the same actions without ever touching
// the swipe. The card itself stays a button to keep the open-detail flow.
// ----------------------------------------------------------------------------

import * as React from "react";
import { cn } from "@/lib/utils";

const REVEAL_PX = 80; // distance at which the action pill is "open"
const TRIGGER_PX = 140; // past this on release → fire the action
const RESISTANCE_AFTER = 100; // beyond this distance, drag halves

export interface SwipeAction {
  /** Visible text on the pill (also used as aria-label). */
  label: string;
  /** Optional icon node rendered to the left of the label. */
  icon?: React.ReactNode;
  /** Pill className for color tokens. e.g. "bg-primary-container text-on-primary-container". */
  className?: string;
  /** Fired when the user swipes past TRIGGER_PX OR taps the revealed pill. */
  onFire: () => void;
}

interface SwipeableCardProps {
  rightAction?: SwipeAction;
  leftAction?: SwipeAction;
  /** Card content. Should look complete on its own — swipe is progressive. */
  children: React.ReactNode;
  /** Optional className for the outer positioning wrapper. */
  className?: string;
}

export function SwipeableCard({
  rightAction,
  leftAction,
  children,
  className,
}: SwipeableCardProps) {
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const startX = React.useRef<number | null>(null);
  const startY = React.useRef<number | null>(null);
  const lockedAxis = React.useRef<"x" | "y" | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);

  const reset = React.useCallback(() => {
    startX.current = null;
    startY.current = null;
    lockedAxis.current = null;
    pointerIdRef.current = null;
    setDragging(false);
    setOffset(0);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore secondary buttons / pen tools we don't care about.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    lockedAxis.current = null;
    pointerIdRef.current = e.pointerId;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null || startY.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    // First-move axis lock: if the user is scrolling vertically, bail.
    if (lockedAxis.current === null) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax < 6 && ay < 6) return; // dead zone
      lockedAxis.current = ax > ay ? "x" : "y";
      if (lockedAxis.current === "x") {
        // Capture so subsequent moves come to us even past the card.
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }
    }
    if (lockedAxis.current !== "x") return;

    // Clamp direction to whichever action is configured.
    let next = dx;
    if (next > 0 && !rightAction) next = 0;
    if (next < 0 && !leftAction) next = 0;

    // Resistance past RESISTANCE_AFTER so the card feels weighty.
    const absNext = Math.abs(next);
    if (absNext > RESISTANCE_AFTER) {
      const extra = absNext - RESISTANCE_AFTER;
      const damped = RESISTANCE_AFTER + extra * 0.5;
      next = next < 0 ? -damped : damped;
    }
    setOffset(next);
  };

  const onPointerUp = () => {
    if (lockedAxis.current === "x") {
      const abs = Math.abs(offset);
      if (abs >= TRIGGER_PX) {
        if (offset > 0 && rightAction) rightAction.onFire();
        else if (offset < 0 && leftAction) leftAction.onFire();
        reset();
        return;
      }
      if (abs >= REVEAL_PX) {
        // Hold at the reveal position so the user can read / tap the pill.
        setOffset(offset > 0 ? REVEAL_PX : -REVEAL_PX);
        setDragging(false);
        startX.current = null;
        startY.current = null;
        lockedAxis.current = null;
        pointerIdRef.current = null;
        return;
      }
    }
    reset();
  };

  const onPointerCancel = () => reset();

  // Spring transition fires whenever we're not actively dragging. While
  // dragging the transform follows the pointer 1:1 (no transition).
  const transitionStyle = dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";

  // Click outside the action pill while it's revealed should snap closed.
  React.useEffect(() => {
    if (offset === 0 || dragging) return;
    const handler = (e: MouseEvent) => {
      const card = (e.target as Element)?.closest?.("[data-swipeable-card]");
      if (!card) {
        setOffset(0);
      }
    };
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [offset, dragging]);

  return (
    <div data-swipeable-card className={cn("relative isolate overflow-hidden", className)}>
      {/* Right action layer — visible when card is dragged right (positive offset). */}
      {rightAction && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"
          aria-hidden={offset <= 0}
        >
          <button
            type="button"
            onClick={() => {
              rightAction.onFire();
              setOffset(0);
            }}
            aria-label={rightAction.label}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold flex items-center gap-2 shadow-sm",
              "transition-opacity",
              offset > 20 ? "opacity-100 pointer-events-auto" : "opacity-0",
              rightAction.className ?? "bg-primary-container text-on-primary-container",
            )}
            tabIndex={offset > 20 ? 0 : -1}
          >
            {rightAction.icon}
            {rightAction.label}
          </button>
        </div>
      )}
      {/* Left action layer — visible when card is dragged left (negative offset). */}
      {leftAction && (
        <div
          className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"
          aria-hidden={offset >= 0}
        >
          <button
            type="button"
            onClick={() => {
              leftAction.onFire();
              setOffset(0);
            }}
            aria-label={leftAction.label}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold flex items-center gap-2 shadow-sm",
              "transition-opacity",
              offset < -20 ? "opacity-100 pointer-events-auto" : "opacity-0",
              leftAction.className ?? "bg-surface-container-highest text-outline",
            )}
            tabIndex={offset < -20 ? 0 : -1}
          >
            {leftAction.icon}
            {leftAction.label}
          </button>
        </div>
      )}
      {/* Foreground card — translates with the pointer. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: transitionStyle,
          willChange: dragging ? "transform" : undefined,
          touchAction: "pan-y",
        }}
        className="relative z-10"
      >
        {children}
      </div>
    </div>
  );
}
