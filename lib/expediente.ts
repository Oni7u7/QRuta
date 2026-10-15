import { z } from "zod";
import type { Taller } from "./auth";
import { CHECK_VALORES, TIPOS, vigenteHasta } from "./config";
import { hashExpedienteV2 } from "./hash";
import { placaSchema } from "./placa";

function addDays(fecha: string, days: number) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

const valor = z.enum(CHECK_VALORES, { error: "Completa todo el checklist" });

// Datos que captura el taller en el formulario.
export const expedienteSchema = z.object({
  placa: placaSchema,
  tipo: z.enum(TIPOS, { error: "Tipo de servicio inválido" }),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .refine((f) => !Number.isNaN(Date.parse(`${f}T00:00:00Z`)), "Fecha inválida")
    // Margen de un día para husos horarios detrás de UTC.
    .refine((f) => f <= addDays(todayUtc(), 1), "La fecha no puede estar en el futuro"),
  kilometraje: z
    .number({ error: "Escribe el kilometraje" })
    .int("El kilometraje debe ser un número entero")
    .min(0, "Kilometraje inválido")
    .max(5_000_000, "Kilometraje inválido"),
  checklist: z.object(
    { frenos: valor, llantas: valor, luces: valor, direccion: valor, suspension: valor, cinturones: valor },
    { error: "Completa todo el checklist" },
  ),
  notas: z.string().trim().max(1000, "Las notas admiten hasta 1000 caracteres").default(""),
});

export type ExpedienteInput = z.infer<typeof expedienteSchema>;

// Completa el expediente con la firma del taller y calcula todo lo que se ancla.
// Es determinista: preparar y enviar obtienen exactamente el mismo resultado.
export function completarExpediente(input: ExpedienteInput, taller: Taller) {
  const data = { ...input, firmado_por: taller.nombre, taller_id: taller.id };
  const hasta = vigenteHasta(data.tipo, data.fecha);
  return {
    data,
    hash: hashExpedienteV2(data),
    vigenteHastaIso: hasta.toISOString(),
    fechaUnix: Math.floor(Date.parse(`${data.fecha}T00:00:00Z`) / 1000),
    vigenteHastaUnix: Math.floor(hasta.getTime() / 1000),
  };
}
