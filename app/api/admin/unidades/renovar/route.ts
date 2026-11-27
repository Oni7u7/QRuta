import { renovarUnidad } from "@/lib/expedientes-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  return renovarUnidad(req);
}
