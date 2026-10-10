import { NextResponse } from "next/server";
import { z } from "zod";
import { getTaller } from "@/lib/auth";
import { CHECK_VALORES, TIPOS, baseUrl, stellarExpertTxUrl, vigenteHasta } from "@/lib/config";
import { hashExpedienteV2 } from "@/lib/hash";
import { placaSchema } from "@/lib/placa";
import { anchorHash, describeStellarError } from "@/lib/stellar";
import { supabaseAdmin } from "@/lib/supabase";
import { generateSecret } from "@/lib/totp";

export const runtime = "nodejs";
export const maxDuration = 30;

function addDays(fecha: string, days: number) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

const valor = z.enum(CHECK_VALORES, { error: "Completa todo el checklist" });

const bodySchema = z.object({
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

export async function POST(req: Request) {
  // Solo talleres con sesión y KYB aprobado pueden firmar.
  const taller = await getTaller();
  if (!taller) {
    return NextResponse.json({ error: "Inicia sesión como taller para registrar servicios" }, { status: 401 });
  }
  if (taller.estado !== "aprobado") {
    return NextResponse.json({ error: "Tu taller aún no está aprobado para firmar expedientes" }, { status: 403 });
  }

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
  const data = { ...parsed.data, firmado_por: taller.nombre, taller_id: taller.id };

  // 1. Hash determinista del expediente y anclaje en Stellar testnet.
  const hash = hashExpedienteV2(data);
  let txHash: string;
  try {
    txHash = await anchorHash(hash);
  } catch (err) {
    console.error("Error al anclar en Stellar:", describeStellarError(err));
    return NextResponse.json({ error: "No se pudo anclar el expediente en Stellar. Intenta de nuevo." }, { status: 502 });
  }

  // 2. Unidad: se crea con su secreto TOTP la primera vez que se registra la placa.
  const sb = supabaseAdmin();
  const { error: upsertError } = await sb
    .from("unidades")
    .upsert({ placa: data.placa, secreto: generateSecret() }, { onConflict: "placa", ignoreDuplicates: true });
  const { data: unidad, error: unidadError } = await sb.from("unidades").select("id").eq("placa", data.placa).single();
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
      taller_id: taller.id,
      tipo: data.tipo,
      fecha: data.fecha,
      kilometraje: data.kilometraje,
      checklist: data.checklist,
      notas: data.notas,
      firmado_por: data.firmado_por,
      hash,
      hash_version: 2,
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
      kilometraje: data.kilometraje,
      checklist: data.checklist,
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
