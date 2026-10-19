import { NextResponse } from "next/server";
import { adminAutorizado } from "@/lib/auth";
import { idValido, obtenerSolicitud } from "@/lib/solicitudes-admin";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Sirve el PDF de una solicitud solo a administradores. La ruta del almacenamiento nunca llega al navegador.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminAutorizado();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = idValido((await params).id);
  const solicitud = id ? await obtenerSolicitud(id) : null;
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const { data, error } = await supabaseAdmin().storage.from("kyb-documentos").download(solicitud.documento_path);
  if (error || !data) {
    console.error("Error al leer el PDF de la solicitud:", id, error?.message);
    return NextResponse.json({ error: "No se pudo leer el documento" }, { status: 502 });
  }
  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="solicitud-${id}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
