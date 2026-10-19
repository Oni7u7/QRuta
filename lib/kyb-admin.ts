import { NextResponse } from "next/server";
import { adminAutorizado } from "./auth";
import { stellarExpertTxUrl } from "./config";
import { SorobanError, aprobarTallerOnChain, suspenderTallerOnChain } from "./soroban";
import { supabaseAdmin } from "./supabase";
import { uuidValido } from "./talleres-admin";

// Suspender o reactivar un taller desde /admin. Primero el contrato (lo que de verdad impide o permite firmar)
// y después la base; si el contrato falla, no se cambia nada.
export async function cambiarEstadoTaller(idRaw: string, accion: "suspender" | "reactivar") {
  const auth = await adminAutorizado();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = uuidValido(idRaw);
  if (!id) return NextResponse.json({ error: "Taller no encontrado" }, { status: 404 });

  const sb = supabaseAdmin();
  const { data: taller } = await sb.from("talleres").select("id, nombre, estado, stellar_address").eq("id", id).maybeSingle();
  if (!taller) return NextResponse.json({ error: "Taller no encontrado" }, { status: 404 });

  const destino = accion === "suspender" ? "suspendido" : "aprobado";
  let tx: string | null = null;
  if (taller.stellar_address) {
    try {
      tx = accion === "suspender" ? await suspenderTallerOnChain(taller.stellar_address) : await aprobarTallerOnChain(taller.stellar_address);
    } catch (err) {
      if (!(err instanceof SorobanError)) console.error(`Error al ${accion} en el contrato:`, err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "No se pudo actualizar el contrato. Intenta de nuevo; no se cambió nada." }, { status: 502 });
    }
  }

  const { error } = await sb.from("talleres").update({ estado: destino }).eq("id", id);
  if (error) {
    console.error(`Contrato actualizado pero no la base (${accion}):`, id, error.message);
    return NextResponse.json({ error: "Se actualizó el contrato, pero no la base. Intenta de nuevo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, estado: destino, tx, stellar_expert: tx ? stellarExpertTxUrl(tx) : null });
}
