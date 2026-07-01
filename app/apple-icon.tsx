import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const badgeSvg = `<svg width="180" height="180" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="88" height="88" rx="22" fill="#1d4ed8"/><g stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M40 30 H33 Q24 30 24 39 V71 Q24 80 33 80 H67 Q76 80 76 71 V39 Q76 30 67 30 H60"/><rect x="40" y="23" width="20" height="11" rx="4"/><circle cx="50" cy="22" r="2"/><polyline points="26,55 36,55 40,51 43,55 47,55 48,61 51,33 53,68 56,55 60,55 64,51 67,55 74,55"/></g></svg>`;

export default function AppleIcon() {
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(badgeSvg).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#1d4ed8",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} width={180} height={180} alt="" />
      </div>
    ),
    { ...size }
  );
}
