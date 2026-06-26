import type { CSSProperties } from "react";

/**
 * TechTalk mark: a speech bubble (talk) containing a voice waveform (record).
 * Built for field-service techs — bold, high-contrast, reads at small sizes.
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
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Speech bubble */}
      <path
        d="M20 14h60a14 14 0 0 1 14 14v34a14 14 0 0 1-14 14H44L26 92V76h-6a14 14 0 0 1-14-14V28a14 14 0 0 1 14-14Z"
        fill="var(--brand)"
      />
      {/* Voice waveform bars */}
      <g
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinecap="round"
      >
        <line x1="30" y1="38" x2="30" y2="52" />
        <line x1="42" y1="31" x2="42" y2="59" />
        <line x1="54" y1="36" x2="54" y2="54" />
        <line x1="66" y1="28" x2="66" y2="62" />
      </g>
      {/* Hi-vis amber center bar — the "live" accent */}
      <line
        x1="54"
        y1="22"
        x2="54"
        y2="68"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0"
      />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span
        className="font-semibold tracking-tight text-foreground"
        style={{ fontSize: size * 0.62 }}
      >
        Tech<span className="text-brand">Talk</span>
      </span>
    </div>
  );
}
