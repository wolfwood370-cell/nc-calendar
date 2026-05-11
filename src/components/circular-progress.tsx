interface CircularProgressProps {
  value: number; // 0..1 (booked/assigned)
  label: string;
  display: string; // e.g. "3/4"
  color?: string; // ring color (hex/css)
  size?: number;
}

export function CircularProgress({
  value,
  label,
  display,
  color = "#003e62",
  size = 96,
}: CircularProgressProps) {
  const pct = Math.min(1, Math.max(0, value));
  const dashOffset = 100 - pct * 100;
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 36 36"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="stroke-surface-container-high"
            cx="18"
            cy="18"
            r="16"
            fill="none"
            strokeWidth="4"
          />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray="100"
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 600ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
            {display}
          </span>
        </div>
      </div>
      <span className="text-sm font-semibold text-on-surface-variant text-center leading-tight whitespace-pre-line">
        {label}
      </span>
    </div>
  );
}
