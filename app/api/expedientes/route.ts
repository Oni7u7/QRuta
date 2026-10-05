import { NextResponse } from "next/server";
import { z } from "zod";
import { TIPOS, baseUrl, stellarExpertTxUrl, vigenteHasta } from "@/lib/config";
import { hashExpediente } from "@/lib/hash";
import { placaSchema } from "@/lib/placa";
import { anchorHash } from "@/lib/stellar";
import { supabaseAdmin } from "@/lib/supabase";
import { generateSecret } from "@/lib/totp";

export const runtime = "nodejs";
export const maxDuration = 30;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

const bodySchema = z.object({
  placa: placaSchema,
  tipo: z.enum(TIPOS, { error: "Tipo de servicio inválido" }),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .refine((f) => !Number.isNaN(Date.parse(`${f}T00:00:00Z`)), "Fecha inválida")
    // Margen de un día para husos horarios detrás de UTC.
    .refine((f) => f <= addDays(todayUtc(), 1), "La fecha no puede estar en el futuro"),
  notas: z.string().trim().max(1000, "Las notas admiten hasta 1000 caracteres").default(""),
  firmado_por: z
    .string()
    .trim()
    .min(2, "Escribe el nombre del taller")
    .max(80, "El nombre del taller admite hasta 80 caracteres"),
});

function addDays(fecha: string, days: number) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 1. Hash determinista del expediente y anclaje en Stellar testnet.
  const hash = hashExpediente(data);
  let txHash: string;
  try {
    txHash = await anchorHash(hash);
  } catch (err) {
    console.error("Error al anclar en Stellar:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "No se pudo anclar el expediente en Stellar. Intenta de nuevo." },
      { status: 502 },
    );
  }

  // 2. Unidad: se crea con su secreto TOTP la primera vez que se registra la placa.
  const sb = supabaseAdmin();
  const { error: upsertError } = await sb
    .from("unidades")
    .upsert({ placa: data.placa, secreto: generateSecret() }, { onConflict: "placa", ignoreDuplicates: true });
  const { data: unidad, error: unidadError } = await sb
    .from("unidades")
    .select("id")
    .eq("placa", data.placa)
    .single();
  if (upsertError || unidadError || !unidad) {
    console.error("Error al guardar la unidad:", (upsertError ?? unidadError)?.message);
    return NextResponse.json({ error: "No se pudo guardar la unidad" }, { status: 500 });
  }

  // 3. Expediente.
  const hasta = vigenteHasta(data.tipo, data.fecha).toISOString();
  const { data: expediente, error: expError } = await sb
    .from("expedientes")
    .insert({
      unidad_id: unidad.id,
      tipo: data.tipo,
      fecha: data.fecha,
      notas: data.notas,
      firmado_por: data.firmado_por,
      hash,
      tx_hash: txHash,
      vigente_hasta: hasta,
    })
    .select("id")
    .single();
  if (expError || !expediente) {
    console.error("Error al guardar el expediente:", expError?.message);
    return NextResponse.json({ error: "No se pudo guardar el expediente" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: expediente.id,
      placa: data.placa,
      tipo: data.tipo,
      fecha: data.fecha,
      firmado_por: data.firmado_por,
      vigente_hasta: hasta,
      hash,
      tx_hash: txHash,
      stellar_expert: stellarExpertTxUrl(txHash),
      pantalla: `${baseUrl()}/pantalla?p=${data.placa}`,
    },
    { status: 201 },
  );
}
