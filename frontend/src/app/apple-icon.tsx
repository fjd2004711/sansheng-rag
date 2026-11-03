import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-static";

const VERMILION = "#A83A2C";

export default function AppleIcon() {
  // The seal drawn as shapes: a CJK glyph makes the build fetch a font from Google, which hangs on an offline server.
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
      <div
        style={{
          width: 128,
          height: 128,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          border: `9px solid ${VERMILION}`,
          borderRadius: 6,
        }}
      >
        <div style={{ width: 52, height: 11, background: VERMILION }} />
        <div style={{ width: 38, height: 11, background: VERMILION }} />
        <div style={{ width: 70, height: 11, background: VERMILION }} />
      </div>
    </div>,
    { ...size },
  );
}
