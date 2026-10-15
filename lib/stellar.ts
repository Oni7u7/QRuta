import { Keypair } from "@stellar/stellar-sdk";
import { STELLAR_HORIZON_URL } from "./config";

// Anclaje por memo: así se registraron los expedientes anteriores al contrato (anclaje "memo").
// Los registros nuevos van al contrato qruta-registry (lib/soroban.ts); aquí solo se verifican los anteriores.

function anchorPublicKey() {
  const secret = process.env.STELLAR_SECRET;
  if (!secret) throw new Error("Falta STELLAR_SECRET");
  return Keypair.fromSecret(secret).publicKey();
}

// Lee de Horizon la transacción de anclaje y devuelve el hash publicado en su memo,
// solo si la transacción tuvo éxito y la firmó la cuenta ancla de QRuta.
// null = no se pudo consultar Stellar a tiempo (no implica que el expediente sea falso).
export async function fetchAnchoredHash(txHash: string, timeoutMs = 2000): Promise<string | false | null> {
  if (!/^[0-9a-f]{64}$/.test(txHash)) return false;
  try {
    const res = await fetch(`${STELLAR_HORIZON_URL}/transactions/${txHash}`, {
      signal: AbortSignal.timeout(timeoutMs),
      // Una transacción confirmada nunca cambia: se puede cachear.
      next: { revalidate: 86_400 },
    });
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const tx = (await res.json()) as { successful: boolean; memo_type: string; memo?: string; source_account: string };
    if (!tx.successful || tx.memo_type !== "hash" || !tx.memo) return false;
    if (tx.source_account !== anchorPublicKey()) return false;
    return Buffer.from(tx.memo, "base64").toString("hex");
  } catch {
    return null;
  }
}
