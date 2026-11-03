import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function AppleIcon() {
  // The fishtail mark drawn as shapes: a CJK glyph makes the build fetch a font from Google, which hangs offline.
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F3EEE3",
      }}
    >
      <svg viewBox="0 0 100 100" width="132" height="132">
        <rect x="49" y="4" width="2" height="9" fill="#2B2620" />
        <rect x="16" y="14" width="68" height="5" fill="#2B2620" />
        <path d="M16 23 H84 V82 C76 74 62 63 50 58 C38 63 24 74 16 82 Z" fill="#2B2620" />
        <path
          d="M22 28 H78 V70 C70 64 60 57 50 53 C40 57 30 64 22 70 Z"
          fill="none"
          stroke="#F3EEE3"
          strokeWidth="1.6"
        />
        <circle cx="50" cy="80" r="5.5" fill="#A83A2C" />
      </svg>
    </div>,
    { ...size },
  );
}
