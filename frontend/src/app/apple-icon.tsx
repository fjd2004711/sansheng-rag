import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function AppleIcon() {
  // Latin initial on purpose: a CJK glyph makes the build fetch a font from Google, which hangs on an offline server.
  const initial = "S";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0E0E0C",
        color: "#C5F94A",
        fontSize: 110,
        fontWeight: 800,
        letterSpacing: "-0.04em",
        fontFamily: "sans-serif",
      }}
    >
      {initial}
    </div>,
    { ...size },
  );
}

