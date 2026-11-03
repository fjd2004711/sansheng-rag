import { ImageResponse } from "next/og";

/**
 * Favicon — the seal: a vermilion frame on paper with the three strokes of 三, drawn as shapes (a CJK glyph would
 * make the build fetch a font, which hangs on an offline server). Renders at 32×32.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const dynamic = "force-static";

const VERMILION = "#A83A2C";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        background: "#F3EEE3",
        border: `3px solid ${VERMILION}`,
        borderRadius: 3,
      }}
    >
      <div style={{ width: 12, height: 3, background: VERMILION }} />
      <div style={{ width: 9, height: 3, background: VERMILION }} />
      <div style={{ width: 16, height: 3, background: VERMILION }} />
    </div>,
    { ...size },
  );
}
