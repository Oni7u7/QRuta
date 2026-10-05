import { NextResponse } from "next/server";
import { baseUrl } from "@/lib/config";
import { placaSchema } from "@/lib/placa";
import { supabaseAdmin } from "@/lib/supabase";
import { currentToken, secondsRemaining } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// Devuelve la URL que la pantalla de la unidad codifica en el QR y los segundos
// que le quedan al token actual. Nunca expone el secreto TOTP.
export async function GET(_req: Request, { params }: { params: Promise<{ placa: string }> }) {
  const parsed = placaSchema.safeParse((await params).placa);
  if (!parsed.success) {
    return NextResponse.json({ error: "Placa inválida" }, { status: 400, headers: noStore });
  }
  const placa = parsed.data;

  const { data: unidad, error } = await supabaseAdmin()
    .from("unidades")
    .select("secreto")
    .eq("placa", placa)
    .maybeSingle();
  if (error) {
    console.error("Error al consultar la unidad:", error.message);
    return NextResponse.json({ error: "No se pudo consultar la unidad" }, { status: 500, headers: noStore });
  }
  if (!unidad) {
    return NextResponse.json({ error: "Unidad no registrada" }, { status: 404, headers: noStore });
  }

  const token = currentToken(unidad.secreto);
  return NextResponse.json(
    {
      url: `${baseUrl()}/verificar?p=${placa}&t=${token}`,
      restante: secondsRemaining(),
    },
    { headers: noStore },
  );
}
