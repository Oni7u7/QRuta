export const inputClass = "campo";

export function abreviar(direccion: string) {
  return `${direccion.slice(0, 4)}…${direccion.slice(-4)}`;
}

export function formatFecha(iso: string, month: "short" | "long" = "short") {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}
