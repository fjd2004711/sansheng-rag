import { ImageResponse } from "next/og";

/** Dynamic favicon — 小证's face: lime square, two eyes. Renders at 32×32. */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#C5F94A",
        borderRadius: "10px",
        gap: 6,
      }}
    >
      <div style={{ width: 5, height: 9, borderRadius: 9999, background: "#1E2410" }} />
      <div style={{ width: 5, height: 9, borderRadius: 9999, background: "#1E2410" }} />
    </div>,
    { ...size },
  );
}

