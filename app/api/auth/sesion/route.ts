import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseSession } from "@/lib/auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  access_token: z.string().min(20).max(5000),
  refresh_token: z.string().min(5).max(500),
});

// Convierte los tokens que trae el enlace de invitación en una sesión con cookie httpOnly.
// Supabase valida los tokens; si no son válidos, no se crea ninguna sesión.
export async function POST(req: Request) {
  // Solo desde la propia app (evita que otro sitio inicie una sesión en tu navegador).
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "El enlace no es válido" }, { status: 400 });

  const sb = await supabaseSession();
  const { data, error } = await sb.auth.setSession(parsed.data);
  if (error || !data.user) return NextResponse.json({ error: "El enlace no es válido o ya caducó" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
