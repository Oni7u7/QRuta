import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/tema";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QRuta",
    short_name: "QRuta",
    description: "Mantenimiento al día, verificado al momento.",
    start_url: "/",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
