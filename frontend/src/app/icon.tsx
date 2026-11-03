import { ImageResponse } from "next/og";

/** Favicon — the fishtail mark on paper, drawn as shapes. Renders at 32×32. */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#F3EEE3" }}>
      <svg viewBox="0 0 100 100" width="32" height="32">
        <rect x="16" y="12" width="68" height="7" fill="#2B2620" />
        <path d="M16 23 H84 V84 C76 76 62 64 50 59 C38 64 24 76 16 84 Z" fill="#2B2620" />
        <circle cx="50" cy="85" r="8" fill="#A83A2C" />
      </svg>
    </div>,
    { ...size },
  );
}
