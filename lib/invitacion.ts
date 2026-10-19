import { baseUrl } from "./config";
import { supabaseAdmin } from "./supabase";

// Invitación al taller aprobado. Con el SMTP gratuito de Supabase el correo solo llega a miembros del equipo
// del proyecto; si no se puede enviar, se genera un enlace de un solo uso para que el admin lo comparta.

export type Invitacion =
  | { modo: "correo"; userId: string }
  | { modo: "enlace"; userId: string; enlace: string }
  | { modo: "existe" }
  | { modo: "error"; detalle: string };

const redirectTo = () => `${baseUrl()}/auth/confirmar`;
const yaExiste = (msg: string) => /already (been )?registered|already exists/i.test(msg);

export async function invitarTaller(email: string, nombre: string): Promise<Invitacion> {
  const sb = supabaseAdmin();
  const inv = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: redirectTo(), data: { nombre } });
  if (!inv.error && inv.data.user) return { modo: "correo", userId: inv.data.user.id };
  if (inv.error && yaExiste(inv.error.message)) return { modo: "existe" };

  // No se pudo enviar el correo: se crea la cuenta con un enlace de invitación sin enviarlo.
  console.error("No se pudo enviar la invitación por correo:", inv.error?.message);
  const link = await sb.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: redirectTo(), data: { nombre } } });
  if (!link.error && link.data.user) return { modo: "enlace", userId: link.data.user.id, enlace: link.data.properties.action_link };
  if (link.error && !yaExiste(link.error.message)) return { modo: "error", detalle: link.error.message };

  // La cuenta llegó a crearse en el intento de correo: se genera un enlace de acceso para esa cuenta.
  return enlaceDeAcceso(email);
}

// Enlace de un solo uso para una cuenta que ya existe (respaldo si el correo no llegó o caducó).
export async function enlaceDeAcceso(email: string): Promise<Invitacion> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: redirectTo() } });
  if (error || !data.user) return { modo: "error", detalle: error?.message ?? "sin usuario" };
  return { modo: "enlace", userId: data.user.id, enlace: data.properties.action_link };
}
