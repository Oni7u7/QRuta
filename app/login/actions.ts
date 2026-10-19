"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { supabaseSession } from "@/lib/auth";

export type LoginState = { error: string | null };

const loginSchema = z.object({
  email: z.email("Escribe un correo válido").max(200),
  password: z.string().min(1, "Escribe tu contraseña").max(200),
});

// Solo se permite volver a rutas de las áreas de talleres o de administración (evita redirecciones abiertas).
function destinoSeguro(next: FormDataEntryValue | null, porDefecto: string) {
  return typeof next === "string" && /^\/(taller|admin)(\/[A-Za-z0-9/_-]*)?(\?[^\s]*)?$/.test(next) ? next : porDefecto;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const sb = await supabaseSession();
  const { data, error } = await sb.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "Correo o contraseña incorrectos" };

  // Los administradores van a /admin; los talleres, a /taller.
  const { data: admin } = await supabaseAdmin().from("admins").select("id").eq("id", data.user.id).maybeSingle();
  redirect(destinoSeguro(form.get("next"), admin ? "/admin" : "/taller"));
}

export async function logout() {
  const sb = await supabaseSession();
  await sb.auth.signOut();
  redirect("/login");
}
