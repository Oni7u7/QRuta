import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Imagen de vista previa al compartir el enlace (WhatsApp, LinkedIn, etc.), con el estilo de la landing.
// Se genera en el build. Fuente: Archivo (OFL) en assets/fuentes.

export const alt = "QRuta: mantenimiento al día, verificado al momento.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { naranja: "#F26A1B", grafito: "#1E2124", oxido: "#B8440A", papel: "#F6F5F3", blanco: "#FFFFFF" };

export default async function Image() {
  const [extra, semi] = await Promise.all([
    readFile(join(process.cwd(), "assets/fuentes/archivo-800.woff")),
    readFile(join(process.cwd(), "assets/fuentes/archivo-600.woff")),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.papel, color: C.grafito, fontFamily: "Archivo" }}>
        <div style={{ flex: 1, display: "flex", padding: "56px 64px 40px", gap: 48 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {/* Isotipo (tuerca, ventana y núcleo) + nombre, como en components/marca/logo.tsx */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <svg width="48" height="55" viewBox="0 0 44 50">
                <polygon points="22,2 42,13.5 42,36.5 22,48 2,36.5 2,13.5" fill={C.grafito} stroke={C.grafito} strokeWidth="4" strokeLinejoin="round" />
                <rect x="11" y="14" width="22" height="22" rx="5" fill={C.blanco} />
                <rect x="17" y="20" width="10" height="10" rx="2.5" fill={C.naranja} />
              </svg>
              <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>QRuta</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 44, fontSize: 76, fontWeight: 800, lineHeight: 0.95, letterSpacing: -3, textTransform: "uppercase" }}>
              <span>Mantenimiento</span>
              <span>al día,</span>
              <span style={{ color: C.oxido }}>verificado</span>
              <span>al momento.</span>
            </div>
          </div>

          {/* Calcomanía con el dato clave. */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 330,
                display: "flex",
                flexDirection: "column",
                background: C.naranja,
                border: `5px solid ${C.grafito}`,
                boxShadow: `12px 12px 0 0 ${C.grafito}`,
                padding: "28px 30px",
                transform: "rotate(3deg)",
              }}
            >
              <span style={{ fontSize: 150, fontWeight: 800, lineHeight: 0.85, letterSpacing: -6 }}>15s</span>
              <span style={{ marginTop: 22, fontSize: 30, fontWeight: 800, lineHeight: 1.1, textTransform: "uppercase" }}>
                Una foto del QR no sirve.
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", background: C.grafito, color: C.papel, padding: "22px 64px", fontSize: 28, fontWeight: 600 }}>
          Expediente de mantenimiento verificable con QR y Stellar.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Archivo", data: extra, weight: 800, style: "normal" },
        { name: "Archivo", data: semi, weight: 600, style: "normal" },
      ],
    },
  );
}
