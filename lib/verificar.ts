import { stellarExpertTxUrl, type Tipo } from "./config";
import { placaSchema } from "./placa";
import { supabaseAdmin } from "./supabase";
import { isValidToken } from "./totp";

export type Estado = "NO_REGISTRADA" | "EXPIRADO" | "SIN_MANTENIMIENTO" | "VENCIDO" | "VIGENTE";

export type DetalleExpediente = {
  placa: string;
  tipo: Tipo;
  fecha: string;
  vigente_hasta: string;
  firmado_por: string;
  hash: string;
  tx_hash: string;
  stellar_expert: string;
};

export type Verificacion =
  | { estado: "NO_REGISTRADA" | "EXPIRADO" | "SIN_MANTENIMIENTO"; placa: string }
  | ({ estado: "VIGENTE" | "VENCIDO" } & DetalleExpediente);

// Decide el estado de una unidad a partir de la placa y el token del QR.
// Orden: placa registrada -> token válido -> último servicio -> vigencia.
export async function verificar(placaRaw: string, token: string): Promise<Verificacion> {
  const parsed = placaSchema.safeParse(placaRaw);
  if (!parsed.success) return { estado: "NO_REGISTRADA", placa: placaRaw.slice(0, 32) };
  const placa = parsed.data;

  const sb = supabaseAdmin();
  const { data: unidad, error } = await sb
    .from("unidades")
    .select("id, secreto")
    .eq("placa", placa)
    .maybeSingle();
  if (error) throw new Error(`Error al consultar la unidad: ${error.message}`);
  if (!unidad) return { estado: "NO_REGISTRADA", placa };

  if (!/^\d{6}$/.test(token) || !isValidToken(token, unidad.secreto)) {
    return { estado: "EXPIRADO", placa };
  }

  // El servicio más reciente (por fecha, y por orden de registro si empatan) define el estado.
  const { data: exp, error: expError } = await sb
    .from("expedientes")
    .select("tipo, fecha, vigente_hasta, firmado_por, hash, tx_hash")
    .eq("unidad_id", unidad.id)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (expError) throw new Error(`Error al consultar el expediente: ${expError.message}`);
  if (!exp) return { estado: "SIN_MANTENIMIENTO", placa };

  const vigente = new Date(exp.vigente_hasta).getTime() >= Date.now();
  return {
    estado: vigente ? "VIGENTE" : "VENCIDO",
    placa,
    tipo: exp.tipo as Tipo,
    fecha: exp.fecha,
    vigente_hasta: new Date(exp.vigente_hasta).toISOString(),
    firmado_por: exp.firmado_por,
    hash: exp.hash,
    tx_hash: exp.tx_hash,
    stellar_expert: stellarExpertTxUrl(exp.tx_hash),
  };
}
