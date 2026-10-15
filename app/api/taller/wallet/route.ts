import { NextResponse } from "next/server";
import { z } from "zod";
import { tallerAutorizado } from "@/lib/auth";
import { asegurarCuentaTestnet, esAprobadoOnChain, esDireccionStellar } from "@/lib/soroban";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  address: z.string().trim().refine(esDireccionStellar, "La dirección de la wallet no es válida"),
});

// Vincula la wallet de Freighter del taller (solo su dirección pública, nunca llaves).
// La aprobación para firmar la da después el admin en el contrato.
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

  try {
    const fondeo = await asegurarCuentaTestnet(address);
    const aprobada = await esAprobadoOnChain(address);
    return NextResponse.json({ address, fondeo, aprobada });
  } catch (err) {
    console.error("Error al preparar la wallet en testnet:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { address, error: "Wallet vinculada, pero no se pudo fondear en testnet. Intenta de nuevo." },
      { status: 502 },
    );
  }
}
