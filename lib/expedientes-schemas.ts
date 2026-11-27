import { z } from "zod";
import { placaSchema } from "./placa";

// Entradas de las acciones de /admin sobre expedientes y unidades (se validan en el servidor).

export const hashSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{64}$/, "Huella inválida");

// El contrato acepta motivos de 3 a 200 caracteres (error 10, MotivoInvalido).
export const anularSchema = z.object({
  hash: hashSchema,
  motivo: z.string().trim().min(3, "Escribe el motivo (mínimo 3 caracteres)").max(200, "El motivo es muy largo (máximo 200)"),
});

export const renovarSchema = z.object({ placa: placaSchema });
