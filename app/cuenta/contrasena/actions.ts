"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdmin, supabaseSession } from "@/lib/auth";

export type ContrasenaState = { error: string | null };

const schema = z
  .object({
    password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(72, "La contraseña admite hasta 72 caracteres"),
    confirmacion: z.string(),
  })
  .refine((d) => d.password === d.confirmacion, { message: "Las contraseñas no coinciden" });

export async function guardarContrasena(_prev: ContrasenaState, form: FormData): Promise<ContrasenaState> {
  const parsed = schema.safeParse({ password: form.get("password"), confirmacion: form.get("confirmacion") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const sb = await supabaseSession();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: "Tu sesión caducó. Abre de nuevo el enlace de invitación." };

  const { error } = await sb.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: /different from the old/i.test(error.message) ? "Usa una contraseña distinta a la anterior." : "No se pudo guardar la contraseña. Intenta de nuevo." };
  }
  redirect((await getAdmin()) ? "/admin" : "/taller");
}
