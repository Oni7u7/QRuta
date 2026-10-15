import { NextResponse } from "next/server";
import { tallerAutorizado } from "@/lib/auth";
import { completarExpediente, expedienteSchema } from "@/lib/expediente";
import { SorobanError, prepararRegistro } from "@/lib/soroban";

export const runtime = "nodejs";
export const maxDuration = 30;

// Paso 1 del registro: arma y simula la llamada `registrar` del contrato.
// Devuelve la transacción para que el taller la firme en Freighter. No guarda nada.
export async function POST(req: Request) {
  const auth = await tallerAutorizado({ conWallet: true });
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { taller } = auth;

  const parsed = expedienteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const e = completarExpediente(parsed.data, taller);

  try {
    const xdr = await prepararRegistro({
      taller: taller.stellar_address!,
      placa: e.data.placa,
      hashHex: e.hash,
      tipo: e.data.tipo,
      fechaUnix: e.fechaUnix,
      vigenteHastaUnix: e.vigenteHastaUnix,
    });
    return NextResponse.json({ xdr, hash: e.hash, network: "TESTNET" });
  } catch (err) {
    if (err instanceof SorobanError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Error al preparar el registro:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "No se pudo preparar el registro" }, { status: 500 });
  }
}
