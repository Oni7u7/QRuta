import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las páginas y rutas.
// (HSTS lo agrega Vercel en producción.)
const seguridad = [
  // Nadie puede meter QRuta dentro de otro sitio (clickjacking). "self" permite el visor de PDF de /admin.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // El navegador no "adivina" el tipo de un archivo.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al salir a otro sitio (Stellar Expert, Freighter) no se envía la URL completa, que puede llevar placa y token.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // QRuta no usa cámara, micrófono, ubicación ni pagos del navegador.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // stellar-sdk trae dependencias nativas opcionales; se carga desde node_modules en el servidor.
  serverExternalPackages: ["@stellar/stellar-sdk"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: seguridad }];
  },
};

export default nextConfig;
