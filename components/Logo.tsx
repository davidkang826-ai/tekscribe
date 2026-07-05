import type { CSSProperties } from "react";

/**
 * TekScribe mark: a clipboard with a heartbeat/pulse line, the field-service
 * job report, brought to life by voice. Outline style, themed to the brand blue.
 */
export function LogoMark({
  size = 72,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="17 17 66 66"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <g
        stroke="var(--brand)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* Square-ish clipboard board, centered, gap at top for the clip */}
        <path d="M40 30 H33 Q24 30 24 39 V71 Q24 80 33 80 H67 Q76 80 76 71 V39 Q76 30 67 30 H60" />
        {/* Clip */}
        <rect x="40" y="23" width="20" height="11" rx="4" />
        {/* Clip hole */}
        <circle cx="50" cy="22" r="2" />
        {/* Heartbeat / pulse line, centered QRS spike, small P/T waves */}
        <polyline points="26,55 36,55 40,51 43,55 47,55 48,61 51,33 53,68 56,55 60,55 64,51 67,55 74,55" />
      </g>
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <LogoMark size={size} />
      <span
        className="font-semibold tracking-tight text-foreground"
        style={{ fontSize: size * 0.62 }}
      >
Tek<span className="text-brand">Scribe</span>
      </span>
    </div>
  );
}
