"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseSession } from "@/lib/auth";

export type LoginState = { error: string | null };

const loginSchema = z.object({
  email: z.email("Escribe un correo válido").max(200),
  password: z.string().min(1, "Escribe tu contraseña").max(200),
});

// Solo se permite volver a rutas del área de talleres (evita redirecciones abiertas).
function destinoSeguro(next: FormDataEntryValue | null) {
  return typeof next === "string" && /^\/taller(\/[A-Za-z0-9/_-]*)?(\?[^\s]*)?$/.test(next) ? next : "/taller";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const sb = await supabaseSession();
  const { error } = await sb.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Correo o contraseña incorrectos" };

  redirect(destinoSeguro(form.get("next")));
}

export async function logout() {
  const sb = await supabaseSession();
  await sb.auth.signOut();
  redirect("/login");
}
