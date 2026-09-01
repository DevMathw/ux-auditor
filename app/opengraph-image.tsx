import { ImageResponse } from "next/og";

export const alt = "UX Auditor — Verifiable UX audits for any URL";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Se genera en build, así que no hay que mantener un PNG a mano. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: "#F5F3EE", color: "#1A1A18", fontFamily: "Georgia, serif", }} >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: 22, color: "#3B6D11", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "28px", }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#1D9E75" }} />
          27 automated checks · evidence included
        </div>
        <div style={{ display: "flex", gap: "24px", fontSize: 96, lineHeight: 1.05, letterSpacing: "-0.03em", }}>
          <span>UX</span>
          <span style={{ color: "#1C5F3A", fontStyle: "italic" }}>Auditor</span>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#6B6B66", marginTop: "28px", maxWidth: 820, lineHeight: 1.4, }}>
          Paste any URL. Get a reproducible score, the evidence behind every issue, and a concrete fix.
        </div>
      </div>
    ),
    size
  );
}
