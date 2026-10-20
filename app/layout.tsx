import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { ReenvioInvitacion } from "@/components/reenvio-invitacion";
import { CLAVE_TEMA, THEME_COLOR } from "@/lib/tema";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "QRuta · Mantenimiento verificable",
  description: "Mantenimiento al día, verificado al momento. Escanea el QR y revisa la unidad antes de subir.",
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
