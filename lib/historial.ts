import { stellarExpertTxUrl, type Checklist, type Tipo } from "./config";
import { supabaseAdmin } from "./supabase";
import { EXPEDIENTE_COLUMNS, comprobarIntegridad, type Integridad } from "./verificar";

export type ExpedienteCompleto = {
  id: number;
  tipo: Tipo;
  fecha: string;
  vigente_hasta: string;
  kilometraje: number | null;
  checklist: Checklist | null;
  notas: string;
  firmado_por: string;
  taller_verificado: boolean;
  hash: string;
  stellar_expert: string;
  integridad: Integridad;
};

// Historial completo de una placa (solo para talleres con sesión).
export async function historialPlaca(placa: string): Promise<{ registrada: boolean; expedientes: ExpedienteCompleto[] }> {
  const sb = supabaseAdmin();
  const { data: unidad, error } = await sb.from("unidades").select("id").eq("placa", placa).maybeSingle();
  if (error) throw new Error(`Error al consultar la unidad: ${error.message}`);
  if (!unidad) return { registrada: false, expedientes: [] };

  const { data, error: expError } = await sb
    .from("expedientes")
    .select(`id, created_at, ${EXPEDIENTE_COLUMNS}`)
    .eq("unidad_id", unidad.id)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (expError) throw new Error(`Error al consultar el historial: ${expError.message}`);

  type Row = Parameters<typeof comprobarIntegridad>[1] & { id: number };
  const rows = (data ?? []) as unknown as Row[];
  const expedientes = await Promise.all(
    rows.map(async (e) => ({
      id: e.id,
      tipo: e.tipo,
      fecha: e.fecha,
      vigente_hasta: e.vigente_hasta,
      kilometraje: e.kilometraje,
      checklist: e.hash_version === 2 ? (e.checklist as Checklist) : null,
      notas: e.notas ?? "",
      firmado_por: e.firmado_por,
      taller_verificado: e.talleres?.estado === "aprobado",
      hash: e.hash,
      stellar_expert: stellarExpertTxUrl(e.tx_hash),
      integridad: await comprobarIntegridad(placa, e),
    })),
  );
  return { registrada: true, expedientes };
}

export type ServicioReciente = {
  id: number;
  placa: string;
  tipo: Tipo;
  fecha: string;
  stellar_expert: string;
};

export async function ultimosDelTaller(tallerId: string, limit = 10): Promise<ServicioReciente[]> {
  const { data, error } = await supabaseAdmin()
    .from("expedientes")
    .select("id, tipo, fecha, tx_hash, unidades(placa)")
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Error al consultar los servicios: ${error.message}`);
  const rows = (data ?? []) as unknown as { id: number; tipo: Tipo; fecha: string; tx_hash: string; unidades: { placa: string } }[];
  return rows.map((r) => ({
    id: r.id,
    placa: r.unidades.placa,
    tipo: r.tipo,
    fecha: r.fecha,
    stellar_expert: stellarExpertTxUrl(r.tx_hash),
  }));
}
