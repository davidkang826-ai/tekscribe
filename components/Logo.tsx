import type { CSSProperties } from "react";

/**
 * TekScribe mark: a clipboard with a heartbeat/pulse line — the field-service
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
      viewBox="9 12 82 82"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <g
        stroke="var(--brand)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* Clipboard board, with a gap at the top for the clip */}
        <path d="M38 24 H29 Q20 24 20 33 V81 Q20 90 29 90 H71 Q80 90 80 81 V33 Q80 24 71 24 H62" />
        {/* Clip */}
        <rect x="38" y="22" width="24" height="12" rx="5" />
        {/* Clip hole */}
        <circle cx="50" cy="20" r="2.2" />
        {/* Heartbeat / pulse line — tall QRS spike centered, small P/T waves */}
        <polyline points="22,57 34,57 38,52 42,57 46,57 48,64 51,29 54,73 57,57 62,57 66,52 70,57 78,57" />
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
