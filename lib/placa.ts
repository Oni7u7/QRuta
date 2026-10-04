import { z } from "zod";

// Mayúsculas y solo A-Z0-9: "abc-12 3" -> "ABC123".
export function normalizePlaca(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const placaSchema = z
  .string()
  .max(32)
  .transform(normalizePlaca)
  .pipe(z.string().min(3, "Placa inválida").max(10, "Placa inválida"));
