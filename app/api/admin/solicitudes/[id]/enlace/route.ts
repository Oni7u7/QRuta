import { NextResponse } from "next/server";
import { adminAutorizado } from "@/lib/auth";
import { enlaceDeAcceso } from "@/lib/invitacion";
import { idValido, obtenerSolicitud } from "@/lib/solicitudes-admin";

export const runtime = "nodejs";

// Nuevo enlace de un solo uso para un taller ya aprobado (si no recibió el correo o el enlace caducó).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminAutorizado();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = idValido((await params).id);
  const s = id ? await obtenerSolicitud(id) : null;
  if (!s || s.estado !== "aprobada" || !s.taller_id) {
    return NextResponse.json({ error: "Solo se pueden generar enlaces para solicitudes aprobadas" }, { status: 409 });
  }
  const r = await enlaceDeAcceso(s.email);
  if (r.modo !== "enlace") {
    console.error("Error al generar el enlace de acceso:", r.modo === "error" ? r.detalle : r.modo);
    return NextResponse.json({ error: "No se pudo generar el enlace" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, enlace: r.enlace });
}
