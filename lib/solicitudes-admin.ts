import { supabaseAdmin } from "./supabase";

// Consultas de solicitudes para el panel de administración (solo servidor, solo admins).

export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada";

export type Solicitud = {
  id: number;
  nombre_comercial: string;
  rfc: string;
  responsable: string;
  email: string;
  telefono: string;
  domicilio: string;
  documento_path: string;
  acepto_privacidad_at: string;
  estado: EstadoSolicitud;
  motivo_rechazo: string | null;
  revisada_at: string | null;
  taller_id: string | null;
  created_at: string;
  admins: { nombre: string } | null;
};

const COLUMNAS =
  "id, nombre_comercial, rfc, responsable, email, telefono, domicilio, documento_path, acepto_privacidad_at, estado, motivo_rechazo, revisada_at, taller_id, created_at, admins(nombre)";

export async function listarSolicitudes() {
  const sb = supabaseAdmin();
  const [pendientes, revisadas] = await Promise.all([
    sb.from("solicitudes").select(COLUMNAS).eq("estado", "pendiente").order("created_at", { ascending: true }),
    sb.from("solicitudes").select(COLUMNAS).neq("estado", "pendiente").order("revisada_at", { ascending: false }).limit(20),
  ]);
  if (pendientes.error || revisadas.error) {
    throw new Error(`Error al consultar solicitudes: ${(pendientes.error ?? revisadas.error)?.message}`);
  }
  return {
    pendientes: (pendientes.data ?? []) as unknown as Solicitud[],
    revisadas: (revisadas.data ?? []) as unknown as Solicitud[],
  };
}

export async function obtenerSolicitud(id: number): Promise<Solicitud | null> {
  const { data, error } = await supabaseAdmin().from("solicitudes").select(COLUMNAS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Error al consultar la solicitud: ${error.message}`);
  return (data as unknown as Solicitud | null) ?? null;
}

export function idValido(raw: string) {
  return /^[0-9]{1,12}$/.test(raw) ? Number(raw) : null;
}

export function formatTelefono(t: string) {
  return t.length === 10 ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : t;
}
