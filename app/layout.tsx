import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { ReenvioInvitacion } from "@/components/reenvio-invitacion";
import { CLAVE_TEMA, THEME_COLOR } from "@/lib/tema";
import { baseUrl } from "@/lib/config";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

const DESCRIPCION =
  "Mantenimiento al día, verificado al momento. Escanea el QR de la unidad y revisa su mantenimiento antes de subir.";

// Las URLs de la vista previa al compartir deben ser absolutas: en Vercel se usa el dominio de producción.
const SITIO = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : baseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: "QRuta · Mantenimiento verificable",
  description: DESCRIPCION,
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "QRuta",
    title: "QRuta · Mantenimiento verificable",
    description: DESCRIPCION,
  },
  twitter: {
    card: "summary_large_image",
    title: "QRuta · Mantenimiento verificable",
    description: DESCRIPCION,
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

// Aplica el tema antes de pintar: la elección guardada o, si no hay, la del sistema. Evita el parpadeo.
const SCRIPT_TEMA = `(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem("${CLAVE_TEMA}")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.dataset.theme=t})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <ReenvioInvitacion />
        {children}
      </body>
    </html>
  );
}
