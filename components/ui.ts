export const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base placeholder:text-zinc-400 focus:border-teal-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-teal-400";

export function formatFecha(iso: string, month: "short" | "long" = "short") {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}
