import { NextResponse } from "next/server";
import { adminAutorizado } from "./auth";
import { stellarExpertTxUrl } from "./config";
import { anularSchema, renovarSchema } from "./expedientes-schemas";
import { SorobanError, anulacionOnChain, anularExpedienteOnChain, renovarOnChain } from "./soroban";
import { supabaseAdmin } from "./supabase";

// Acciones de /admin sobre expedientes y unidades. Las firma la cuenta admin del contrato desde el servidor.

async function leerJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function errorDeStellar(err: unknown, accion: string) {
  if (err instanceof SorobanError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`Error al ${accion} en el contrato:`, err instanceof Error ? err.message.slice(0, 200) : err);
  return NextResponse.json({ error: "No se pudo completar la operación en Stellar. Intenta de nuevo." }, { status: 502 });
}

// POST /api/admin/expedientes/anular  { hash, motivo }
export async function anularExpediente(req: Request) {
  const auth = await adminAutorizado();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = anularSchema.safeParse(await leerJson(req));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const { hash, motivo } = parsed.data;

  // Solo los expedientes firmados en el contrato se pueden anular ahí.
  const { data: exp } = await supabaseAdmin().from("expedientes").select("id, anclaje").eq("hash", hash).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
  if (exp.anclaje !== "soroban") {
    return NextResponse.json({ error: "Este expediente se ancló por memo, no en el contrato: no se puede anular ahí." }, { status: 409 });
  }

  try {
    const tx = await anularExpedienteOnChain(hash, motivo);
    return NextResponse.json({ ok: true, tx, stellar_expert: stellarExpertTxUrl(tx) });
  } catch (err) {
    return errorDeStellar(err, "anular");
  }
}

// POST /api/admin/unidades/renovar  { placa }
export async function renovarUnidad(req: Request) {
  const auth = await adminAutorizado();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = renovarSchema.safeParse(await leerJson(req));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Placa inválida" }, { status: 400 });

  const { data: unidad } = await supabaseAdmin().from("unidades").select("id").eq("placa", parsed.data.placa).maybeSingle();
  if (!unidad) return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });

  try {
    const tx = await renovarOnChain(parsed.data.placa);
    return NextResponse.json({ ok: true, tx, stellar_expert: stellarExpertTxUrl(tx) });
  } catch (err) {
    return errorDeStellar(err, "renovar");
  }
}

export type ExpedienteAdmin = {
  placa: string;
  tipo: string;
  fecha: string;
  vigente_hasta: string;
  taller: string | null;
  hash: string;
  // Anulación en el contrato: null si Stellar no respondió a tiempo.
  anulado: { motivo: string } | false | null;
};

const TIMEOUT_MS = 3000;

async function anulacionConTimeout(hash: string) {
  try {
    const r = await Promise.race([anulacionOnChain(hash), new Promise<"timeout">((res) => setTimeout(() => res("timeout"), TIMEOUT_MS))]);
    if (r === "timeout") return null;
    return r ? { motivo: r.motivo } : false;
  } catch {
    return null;
  }
}

// Los últimos servicios firmados en el contrato, para anularlos o renovar su placa desde /admin.
export async function listarExpedientesRecientes(limite = 10): Promise<ExpedienteAdmin[]> {
  const { data, error } = await supabaseAdmin()
    .from("expedientes")
    .select("tipo, fecha, vigente_hasta, hash, unidades(placa), talleres(nombre)")
    .eq("anclaje", "soroban")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Error al consultar expedientes: ${error.message}`);
  type Fila = { tipo: string; fecha: string; vigente_hasta: string; hash: string; unidades: { placa: string } | null; talleres: { nombre: string } | null };
  const filas = (data ?? []) as unknown as Fila[];
  return Promise.all(
    filas.map(async (f) => ({
      placa: f.unidades?.placa ?? "?",
      tipo: f.tipo,
      fecha: f.fecha,
      vigente_hasta: f.vigente_hasta,
      taller: f.talleres?.nombre ?? null,
      hash: f.hash,
      anulado: await anulacionConTimeout(f.hash),
    })),
  );
}
