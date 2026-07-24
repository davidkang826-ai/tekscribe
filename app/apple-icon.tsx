import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The exact same mark, background, and 0.72 scale the native app icon uses
// (scripts/render-app-icons.mjs), so the "Add to Home Screen" icon looks
// identical to the installed app. No baked-in rounded corners: iOS masks the
// tile itself. Mark box is 0.72 * 180 = 130px, centered on the blue tile.
const MARK = 130;
const markSvg = `<svg width="${MARK}" height="${MARK}" viewBox="17 17 66 66" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M40 25 H33 Q24 25 24 34 V66 Q24 75 33 75 H67 Q76 75 76 66 V34 Q76 25 67 25 H60" />
    <rect x="40" y="18" width="20" height="11" rx="4" />
    <polyline points="26,53 36,53 40,49 43,53 47,53 48,59 51,37 53,65 56,53 60,53 64,49 67,53 74,53" />
  </g>
</svg>`;

export default function AppleIcon() {
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(markSvg).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#1d4ed8",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} width={MARK} height={MARK} alt="" />
      </div>
    ),
    { ...size }
  );
}
