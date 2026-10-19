import { z } from "zod";
import { PDF_MAX_BYTES } from "./config";

export const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

// RFC en mayúsculas y sin espacios ni guiones: "lopj-800101 ab1" -> "LOPJ800101AB1".
export function normalizarRfc(raw: string) {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

const texto = (min: number, max: number, campo: string) =>
  z
    .string({ error: `Escribe ${campo}` })
    .trim()
    .min(min, `Escribe ${campo}`)
    .max(max, `${campo[0].toUpperCase()}${campo.slice(1)} admite hasta ${max} caracteres`);

// Campos que llena el taller en /registro-taller (el PDF se valida aparte).
export const solicitudSchema = z.object({
  nombre_comercial: texto(2, 120, "el nombre comercial"),
  rfc: z
    .string({ error: "Escribe el RFC" })
    .transform(normalizarRfc)
    .pipe(z.string().regex(RFC_REGEX, "El RFC no tiene un formato válido (12 o 13 caracteres)")),
  responsable: texto(2, 120, "el nombre del responsable"),
  email: z.email("Escribe un correo válido").max(200).transform((e) => e.toLowerCase()),
  telefono: z
    .string({ error: "Escribe el teléfono" })
    .transform((t) => t.replace(/\D/g, ""))
    .pipe(z.string().length(10, "El teléfono debe tener 10 dígitos")),
  domicilio: texto(5, 300, "el domicilio del taller"),
  acepto_privacidad: z.literal("on", { error: "Debes aceptar el aviso de privacidad" }),
});

export type SolicitudInput = z.infer<typeof solicitudSchema>;

// Comprueba que el archivo de verdad sea un PDF (por su contenido, no solo por su nombre).
export async function validarPdf(archivo: FormDataEntryValue | null): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Adjunta el documento en PDF" };
  if (archivo.size > PDF_MAX_BYTES) return { ok: false, error: "El PDF debe pesar 4 MB o menos" };
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, error: "El archivo no es un PDF válido" };
  }
  return { ok: true, bytes };
}
