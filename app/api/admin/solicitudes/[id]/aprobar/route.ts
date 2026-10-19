import { NextResponse } from "next/server";
import { adminAutorizado } from "@/lib/auth";
import { invitarTaller } from "@/lib/invitacion";
import { idValido } from "@/lib/solicitudes-admin";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

// Aprueba el KYB de una solicitud: crea la cuenta del taller y le envía la invitación.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminAutorizado();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = idValido((await params).id);
  if (!id) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const sb = supabaseAdmin();
  // 1. Se "reserva" la solicitud: solo una aprobación gana aunque se haga doble clic o haya dos admins.
  const { data: s } = await sb
    .from("solicitudes")
    .update({ estado: "aprobada", revisada_por: auth.admin.id, revisada_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id, nombre_comercial, rfc, email")
    .maybeSingle();
  if (!s) return NextResponse.json({ error: "La solicitud no existe o ya fue revisada" }, { status: 409 });

  const revertir = () =>
    sb.from("solicitudes").update({ estado: "pendiente", revisada_por: null, revisada_at: null }).eq("id", id);

  // 2. Cuenta e invitación.
  const inv = await invitarTaller(s.email, s.nombre_comercial);
  if (inv.modo === "existe") {
    await revertir();
    return NextResponse.json({ error: "Ya existe una cuenta con este correo en QRuta" }, { status: 409 });
  }
  if (inv.modo === "error") {
    await revertir();
    console.error("Error al crear la cuenta del taller:", inv.detalle);
    return NextResponse.json({ error: "No se pudo crear la cuenta del taller. Intenta de nuevo." }, { status: 502 });
  }

  // 3. Taller con KYB aprobado.
  const { error: tallerError } = await sb.from("talleres").insert({ id: inv.userId, nombre: s.nombre_comercial, rfc: s.rfc, estado: "aprobado" });
  if (tallerError) {
    await sb.auth.admin.deleteUser(inv.userId);
    await revertir();
    console.error("Error al registrar el taller:", tallerError.message);
    return NextResponse.json({ error: "No se pudo registrar el taller. Intenta de nuevo." }, { status: 500 });
  }
  await sb.from("solicitudes").update({ taller_id: inv.userId }).eq("id", id);

  return NextResponse.json({
    ok: true,
    email: s.email,
    modo: inv.modo,
    // Solo cuando el correo no pudo enviarse: enlace de un solo uso para compartir con el taller.
    enlace: inv.modo === "enlace" ? inv.enlace : null,
  });
}
