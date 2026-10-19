import { esAprobadoOnChain } from "./soroban";
import { supabaseAdmin } from "./supabase";

// Talleres para el panel de administración (solo servidor, solo admins).

export type TallerAdmin = {
  id: string;
  nombre: string;
  rfc: string | null;
  estado: "pendiente" | "aprobado" | "suspendido";
  stellar_address: string | null;
  email: string | null;
  servicios: number;
  // Aprobación en el contrato: null si no tiene wallet o Stellar no respondió.
  onChain: boolean | null;
};

const TIMEOUT_MS = 3000;

async function aprobadoConTimeout(direccion: string) {
  try {
    return await Promise.race([esAprobadoOnChain(direccion), new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]);
  } catch {
    return null;
  }
}

export async function listarTalleres(): Promise<TallerAdmin[]> {
  const sb = supabaseAdmin();
  const [talleres, expedientes, usuarios] = await Promise.all([
    sb.from("talleres").select("id, nombre, rfc, estado, stellar_address, created_at").order("created_at", { ascending: false }),
    sb.from("expedientes").select("taller_id").not("taller_id", "is", null),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (talleres.error) throw new Error(`Error al consultar talleres: ${talleres.error.message}`);

  const correos = new Map((usuarios.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const servicios = new Map<string, number>();
  for (const e of expedientes.data ?? []) servicios.set(e.taller_id, (servicios.get(e.taller_id) ?? 0) + 1);

  return Promise.all(
    (talleres.data ?? []).map(async (t) => ({
      id: t.id,
      nombre: t.nombre,
      rfc: t.rfc,
      estado: t.estado,
      stellar_address: t.stellar_address,
      email: correos.get(t.id) ?? null,
      servicios: servicios.get(t.id) ?? 0,
      onChain: t.stellar_address ? await aprobadoConTimeout(t.stellar_address) : null,
    })),
  );
}

export function uuidValido(raw: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}
