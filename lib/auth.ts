import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE } from "./cookies";
import { supabaseAdmin } from "./supabase";

export type Taller = {
  id: string;
  nombre: string;
  rfc: string | null;
  estado: "pendiente" | "aprobado" | "suspendido";
  stellar_address: string | null;
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
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, { ...options, ...SESSION_COOKIE }));
        } catch {
          // Llamado desde un Server Component: el middleware ya refresca las cookies.
        }
      },
    },
  });
}

export class SesionNoVerificable extends Error {
  constructor() {
    super("No se pudo verificar la sesión con Supabase");
  }
}

// Para las rutas de la API: exige sesión, KYB aprobado y, si se pide, wallet vinculada.
export async function tallerAutorizado(opts: { conWallet: boolean }) {
  let taller: Taller | null;
  try {
    taller = await getTaller();
  } catch (err) {
    if (err instanceof SesionNoVerificable) {
      return { error: "No se pudo verificar tu sesión. Intenta de nuevo en unos segundos.", status: 503 } as const;
    }
    throw err;
  }
  if (!taller) return { error: "Inicia sesión como taller para registrar servicios", status: 401 } as const;
  if (taller.estado !== "aprobado") {
    return { error: "Tu taller aún no está aprobado para firmar expedientes", status: 403 } as const;
  }
  if (opts.conWallet && !taller.stellar_address) {
    return { error: "Conecta tu wallet de Freighter antes de registrar servicios", status: 409 } as const;
  }
  return { taller } as const;
}

// Taller de la sesión actual (o null si no hay sesión o el usuario no es un taller).
// cache(): layout y página comparten la misma consulta dentro de una petición.
export const getTaller = cache(async (): Promise<Taller | null> => {
  const sb = await supabaseSession();
  const {
    data: { user },
    error: authError,
  } = await sb.auth.getUser();
  // Un fallo de red con Supabase no significa "sin sesión": no mandamos al taller a iniciar sesión.
  if (authError && isAuthRetryableFetchError(authError)) throw new SesionNoVerificable();
  if (!user) return null;

  const { data, error } = await supabaseAdmin()
    .from("talleres")
    .select("id, nombre, rfc, estado, stellar_address")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Error al consultar el taller: ${error.message}`);
  return (data as Taller | null) ?? null;
});
