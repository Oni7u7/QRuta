import { NextResponse } from "next/server";
import { z } from "zod";
import { tallerAutorizado } from "@/lib/auth";
import { SorobanError, aprobarTallerOnChain, asegurarCuenta, esAprobadoOnChain, esDireccionStellar } from "@/lib/soroban";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
// El fondeo con Friendbot (solo testnet) y la aprobación en el contrato pueden tardar ~20 s.
export const maxDuration = 60;

const bodySchema = z.object({
  address: z.string().trim().refine(esDireccionStellar, "La dirección de la wallet no es válida"),
});

// Vincula la wallet de Freighter del taller (solo su dirección pública, nunca llaves) y, como el KYB del
// taller ya fue aprobado por un admin, la aprueba en el contrato en ese momento (firma el servidor).
// Si se llama otra vez con la misma wallet, reintenta la activación: aprobar dos veces no cambia nada.
export async function POST(req: Request) {
  const auth = await tallerAutorizado({ conWallet: false });
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { taller } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { address } = parsed.data;

  if (taller.stellar_address && taller.stellar_address !== address) {
    return NextResponse.json(
      { error: "Tu taller ya tiene otra wallet vinculada. Para cambiarla, contacta a QRuta." },
      { status: 409 },
    );
  }

  if (!taller.stellar_address) {
    const { error } = await supabaseAdmin().from("talleres").update({ stellar_address: address }).eq("id", taller.id);
    if (error) {
      const duplicada = error.code === "23505";
      if (!duplicada) console.error("Error al vincular la wallet:", error.message);
      return NextResponse.json(
        { error: duplicada ? "Esa wallet ya está vinculada a otro taller." : "No se pudo vincular la wallet" },
        { status: duplicada ? 409 : 500 },
      );
    }
  }

  let fondeo: "existente" | "fondeada";
  try {
    fondeo = await asegurarCuenta(address);
  } catch (err) {
    if (err instanceof SorobanError) return NextResponse.json({ address, error: err.message }, { status: err.status });
    console.error("Error al fondear la wallet:", err instanceof Error ? err.message : err);
    return NextResponse.json({ address, error: "Wallet vinculada, pero no se pudo activar en Stellar. Intenta de nuevo." }, { status: 502 });
  }

  try {
    let tx: string | null = null;
    if (!(await esAprobadoOnChain(address))) tx = await aprobarTallerOnChain(address);
    return NextResponse.json({ address, fondeo, aprobada: true, tx });
  } catch (err) {
    if (!(err instanceof SorobanError)) console.error("Error al aprobar la wallet en el contrato:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { address, fondeo, aprobada: false, error: "Wallet vinculada, pero no se pudo activar en el contrato. Intenta de nuevo." },
      { status: 502 },
    );
  }
}
