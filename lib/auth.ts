import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabaseAdmin } from "./supabase";

export type Taller = {
  id: string;
  nombre: string;
  rfc: string | null;
  estado: "pendiente" | "aprobado" | "suspendido";
};

export function supabaseAuthConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY");
  return { url, key };
}

// Cliente de Supabase con la sesión del usuario (cookies). Solo para Auth;
// los datos se leen con el cliente admin porque las tablas no tienen políticas RLS.
export async function supabaseSession() {
  const cookieStore = await cookies();
  const { url, key } = supabaseAuthConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el middleware ya refresca las cookies.
        }
      },
    },
  });
}

// Taller de la sesión actual (o null si no hay sesión o el usuario no es un taller).
// cache(): layout y página comparten la misma consulta dentro de una petición.
export const getTaller = cache(async (): Promise<Taller | null> => {
  const sb = await supabaseSession();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabaseAdmin()
    .from("talleres")
    .select("id, nombre, rfc, estado")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Error al consultar el taller: ${error.message}`);
  return (data as Taller | null) ?? null;
});
