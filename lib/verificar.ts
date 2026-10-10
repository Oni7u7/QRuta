import { stellarExpertTxUrl, type Checklist, type Tipo } from "./config";
import { recomputeHash } from "./hash";
import { placaSchema } from "./placa";
import { fetchAnchoredHash } from "./stellar";
import { supabaseAdmin } from "./supabase";
import { isValidToken } from "./totp";

export type Estado = "NO_REGISTRADA" | "EXPIRADO" | "SIN_MANTENIMIENTO" | "VENCIDO" | "VIGENTE";

// Resultado de comprobar que el expediente no fue alterado:
// datos -> el hash recalculado con los datos guardados coincide con el hash registrado.
// stellar -> el hash registrado es el que está en el memo de la transacción (null: Stellar no respondió a tiempo).
export type Integridad = { datos: boolean; stellar: boolean | null };

export type DetalleExpediente = {
  placa: string;
  tipo: Tipo;
  fecha: string;
  vigente_hasta: string;
  firmado_por: string;
  taller_verificado: boolean;
  // Resumen público: el checklist sí, las notas y el kilometraje no.
  checklist: Checklist | null;
  hash: string;
  tx_hash: string;
  stellar_expert: string;
  integridad: Integridad;
};

export type Verificacion =
  | { estado: "NO_REGISTRADA" | "EXPIRADO" | "SIN_MANTENIMIENTO"; placa: string }
  | ({ estado: "VIGENTE" | "VENCIDO" } & DetalleExpediente);

type ExpedienteRow = {
  tipo: Tipo;
  fecha: string;
  vigente_hasta: string;
  kilometraje: number | null;
  checklist: Record<string, string>;
  notas: string | null;
  firmado_por: string;
  taller_id: string | null;
  hash: string;
  hash_version: number;
  tx_hash: string;
  talleres: { estado: string } | null;
};

export async function comprobarIntegridad(placa: string, e: ExpedienteRow): Promise<Integridad> {
  const recalculado = recomputeHash(e.hash_version, {
    placa,
    tipo: e.tipo,
    fecha: e.fecha,
    notas: e.notas ?? "",
    firmado_por: e.firmado_por,
    kilometraje: e.kilometraje,
    checklist: e.checklist,
    taller_id: e.taller_id,
  });
  const anclado = await fetchAnchoredHash(e.tx_hash);
  return {
    datos: recalculado === e.hash,
    stellar: anclado === null ? null : anclado === e.hash,
  };
}

export const EXPEDIENTE_COLUMNS =
  "tipo, fecha, vigente_hasta, kilometraje, checklist, notas, firmado_por, taller_id, hash, hash_version, tx_hash, talleres(estado)";

// Decide el estado de una unidad a partir de la placa y el token del QR.
// Orden: placa registrada -> token válido -> último servicio -> vigencia.
export async function verificar(placaRaw: string, token: string): Promise<Verificacion> {
  const parsed = placaSchema.safeParse(placaRaw);
  if (!parsed.success) return { estado: "NO_REGISTRADA", placa: placaRaw.slice(0, 32) };
  const placa = parsed.data;

  const sb = supabaseAdmin();
  const { data: unidad, error } = await sb.from("unidades").select("id, secreto").eq("placa", placa).maybeSingle();
  if (error) throw new Error(`Error al consultar la unidad: ${error.message}`);
  if (!unidad) return { estado: "NO_REGISTRADA", placa };

  if (!/^\d{6}$/.test(token) || !isValidToken(token, unidad.secreto)) {
    return { estado: "EXPIRADO", placa };
  }

  // El servicio más reciente (por fecha, y por orden de registro si empatan) define el estado.
  const { data, error: expError } = await sb
    .from("expedientes")
    .select(EXPEDIENTE_COLUMNS)
    .eq("unidad_id", unidad.id)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (expError) throw new Error(`Error al consultar el expediente: ${expError.message}`);
  if (!data) return { estado: "SIN_MANTENIMIENTO", placa };
  const exp = data as unknown as ExpedienteRow;

  const vigente = new Date(exp.vigente_hasta).getTime() >= Date.now();
  return {
    estado: vigente ? "VIGENTE" : "VENCIDO",
    placa,
    tipo: exp.tipo,
    fecha: exp.fecha,
    vigente_hasta: new Date(exp.vigente_hasta).toISOString(),
    firmado_por: exp.firmado_por,
    taller_verificado: exp.talleres?.estado === "aprobado",
    checklist: exp.hash_version === 2 ? (exp.checklist as Checklist) : null,
    hash: exp.hash,
    tx_hash: exp.tx_hash,
    stellar_expert: stellarExpertTxUrl(exp.tx_hash),
    integridad: await comprobarIntegridad(placa, exp),
  };
}
