import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAutorizado } from "@/lib/auth";
import { idValido } from "@/lib/solicitudes-admin";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const bodySchema = z.object({
  motivo: z.string().trim().min(5, "Escribe el motivo del rechazo").max(500, "El motivo admite hasta 500 caracteres"),
});

// Rechaza una solicitud con su motivo. No se crea ninguna cuenta.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminAutorizado();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = idValido((await params).id);
  if (!id) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });

  const { data } = await supabaseAdmin()
    .from("solicitudes")
    .update({ estado: "rechazada", motivo_rechazo: parsed.data.motivo, revisada_por: auth.admin.id, revisada_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id")
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "La solicitud no existe o ya fue revisada" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
