import { cambiarEstadoTaller } from "@/lib/kyb-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return cambiarEstadoTaller((await params).id, "reactivar");
}
