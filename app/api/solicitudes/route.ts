import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { solicitudSchema, validarPdf } from "@/lib/solicitud";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "kyb-documentos";
// Límites básicos contra envíos masivos.
const MAX_POR_CORREO_24H = 3;
const MAX_GLOBAL_POR_HORA = 50;

// Solicitud pública de alta de un taller. No requiere sesión.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 });
  }

  // Campo trampa: invisible para personas; si viene lleno, es un bot. Respondemos como si todo fuera bien.
  if (String(form.get("sitio_web") ?? "").trim() !== "") return NextResponse.json({ ok: true }, { status: 201 });

  const parsed = solicitudSchema.safeParse({
    nombre_comercial: form.get("nombre_comercial"),
    rfc: form.get("rfc"),
    responsable: form.get("responsable"),
    email: form.get("email"),
    telefono: form.get("telefono"),
    domicilio: form.get("domicilio"),
    acepto_privacidad: form.get("acepto_privacidad"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const datos = parsed.data;

  const pdf = await validarPdf(form.get("documento"));
  if (!pdf.ok) return NextResponse.json({ error: pdf.error }, { status: 400 });

  const sb = supabaseAdmin();
  const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString();
  const haceUnDia = new Date(Date.now() - 86_400_000).toISOString();
  const [porCorreo, global, cuenta] = await Promise.all([
    sb.from("solicitudes").select("id", { count: "exact", head: true }).eq("email", datos.email).gte("created_at", haceUnDia),
    sb.from("solicitudes").select("id", { count: "exact", head: true }).gte("created_at", haceUnaHora),
    sb.from("solicitudes").select("id").eq("email", datos.email).eq("estado", "aprobada").limit(1),
  ]);
  if ((porCorreo.count ?? 0) >= MAX_POR_CORREO_24H || (global.count ?? 0) >= MAX_GLOBAL_POR_HORA) {
    return NextResponse.json({ error: "Recibimos demasiadas solicitudes. Intenta de nuevo más tarde." }, { status: 429 });
  }
  if (cuenta.data?.length) {
    return NextResponse.json({ error: "Este correo ya tiene un taller aprobado. Inicia sesión en QRuta." }, { status: 409 });
  }

  // El PDF va a un bucket privado con un nombre aleatorio (sin datos del taller en la ruta).
  const ruta = `solicitudes/${randomUUID()}.pdf`;
  const subida = await sb.storage.from(BUCKET).upload(ruta, pdf.bytes, { contentType: "application/pdf", upsert: false });
  if (subida.error) {
    console.error("Error al guardar el PDF de la solicitud:", subida.error.message);
    return NextResponse.json({ error: "No se pudo guardar el documento. Intenta de nuevo." }, { status: 500 });
  }

  const { error } = await sb.from("solicitudes").insert({
    nombre_comercial: datos.nombre_comercial,
    rfc: datos.rfc,
    responsable: datos.responsable,
    email: datos.email,
    telefono: datos.telefono,
    domicilio: datos.domicilio,
    documento_path: ruta,
    acepto_privacidad_at: new Date().toISOString(),
  });
  if (error) {
    await sb.storage.from(BUCKET).remove([ruta]);
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ya hay una solicitud pendiente con este correo. Espera la respuesta de QRuta." }, { status: 409 });
    }
    console.error("Error al guardar la solicitud:", error.message);
    return NextResponse.json({ error: "No se pudo guardar la solicitud. Intenta de nuevo." }, { status: 500 });
  }

  // No se devuelve ningún dato de la solicitud.
  return NextResponse.json({ ok: true }, { status: 201 });
}
