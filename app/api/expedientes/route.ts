import { NextResponse } from "next/server";
import { z } from "zod";
import { tallerAutorizado } from "@/lib/auth";
import { baseUrl, contractId, stellarExpertContractUrl, stellarExpertTxUrl } from "@/lib/config";
import { completarExpediente, expedienteSchema } from "@/lib/expediente";
import { SorobanError, enviarYConfirmar, validarRegistroFirmado } from "@/lib/soroban";
import { supabaseAdmin } from "@/lib/supabase";
import { generateSecret } from "@/lib/totp";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = expedienteSchema.extend({
  signedXdr: z.string({ error: "Falta la firma del taller" }).min(1, "Falta la firma del taller").max(20_000),
});

// Paso 2 del registro: recibe la transacción firmada en Freighter, comprueba que sea
// exactamente la del expediente, la envía al contrato y, si la red la confirma, guarda el expediente.
export async function POST(req: Request) {
  const auth = await tallerAutorizado({ conWallet: true });
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { taller } = auth;
  const wallet = taller.stellar_address!;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { signedXdr, ...input } = parsed.data;
  const e = completarExpediente(input, taller);

  // 1. Firma del taller y registro en el contrato.
  let txHash: string;
  try {
    const tx = validarRegistroFirmado(signedXdr, {
      taller: wallet,
      placa: e.data.placa,
      hashHex: e.hash,
      tipo: e.data.tipo,
      fechaUnix: e.fechaUnix,
      vigenteHastaUnix: e.vigenteHastaUnix,
    });
    txHash = await enviarYConfirmar(tx);
  } catch (err) {
    if (err instanceof SorobanError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Error al registrar en el contrato:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "No se pudo registrar en Stellar. Intenta de nuevo." }, { status: 502 });
  }

  // 2. Unidad: se crea con su secreto TOTP la primera vez que se registra la placa.
  const sb = supabaseAdmin();
  const { error: upsertError } = await sb
    .from("unidades")
    .upsert({ placa: e.data.placa, secreto: generateSecret() }, { onConflict: "placa", ignoreDuplicates: true });
  const { data: unidad, error: unidadError } = await sb.from("unidades").select("id").eq("placa", e.data.placa).single();
  if (upsertError || unidadError || !unidad) {
    console.error("Expediente en el contrato pero sin guardar la unidad:", txHash, (upsertError ?? unidadError)?.message);
    return NextResponse.json({ error: "Se registró en Stellar, pero no se pudo guardar la unidad" }, { status: 500 });
  }

  // 3. Expediente completo (notas, km y checklist solo viven aquí; en el contrato va su hash).
  const { data: expediente, error: expError } = await sb
    .from("expedientes")
    .insert({
      unidad_id: unidad.id,
      taller_id: taller.id,
      tipo: e.data.tipo,
      fecha: e.data.fecha,
      kilometraje: e.data.kilometraje,
      checklist: e.data.checklist,
      notas: e.data.notas,
      firmado_por: e.data.firmado_por,
      hash: e.hash,
      hash_version: 2,
      anclaje: "soroban",
      firmado_con: wallet,
      tx_hash: txHash,
      vigente_hasta: e.vigenteHastaIso,
    })
    .select("id")
    .single();
  if (expError || !expediente) {
    console.error("Expediente en el contrato pero sin guardar en la base:", txHash, expError?.message);
    return NextResponse.json({ error: "Se registró en Stellar, pero no se pudo guardar el expediente" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: expediente.id,
      placa: e.data.placa,
      tipo: e.data.tipo,
      fecha: e.data.fecha,
      kilometraje: e.data.kilometraje,
      checklist: e.data.checklist,
      firmado_por: e.data.firmado_por,
      firmado_con: wallet,
      vigente_hasta: e.vigenteHastaIso,
      hash: e.hash,
      tx_hash: txHash,
      stellar_expert: stellarExpertTxUrl(txHash),
      contrato: stellarExpertContractUrl(contractId()),
      pantalla: `${baseUrl()}/pantalla?p=${e.data.placa}`,
    },
    { status: 201 },
  );
}
