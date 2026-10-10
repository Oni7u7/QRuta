import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { STELLAR_HORIZON_URL } from "./config";

const server = new Horizon.Server(STELLAR_HORIZON_URL);

function anchorKeypair() {
  const secret = process.env.STELLAR_SECRET;
  if (!secret) throw new Error("Falta STELLAR_SECRET");
  return Keypair.fromSecret(secret);
}

function isBadSeq(err: unknown) {
  const codes = (err as { response?: { data?: { extras?: { result_codes?: { transaction?: string } } } } })
    ?.response?.data?.extras?.result_codes;
  return codes?.transaction === "tx_bad_seq";
}

async function submitAnchor(kp: Keypair, hashHex: string) {
  const account = await server.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    // Pago mínimo a sí misma: no crea subentradas y el hash viaja en el memo.
    .addOperation(
      Operation.payment({
        destination: kp.publicKey(),
        asset: Asset.native(),
        amount: "0.0000001",
      }),
    )
    .addMemo(Memo.hash(hashHex))
    .setTimeout(30)
    .build();
  tx.sign(kp);
  const res = await server.submitTransaction(tx);
  return res.hash;
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
    if (tx.source_account !== anchorKeypair().publicKey()) return false;
    return Buffer.from(tx.memo, "base64").toString("hex");
  } catch {
    return null;
  }
}

// Ancla un hash SHA-256 (hex de 64 caracteres) en Stellar testnet y devuelve el tx_hash.
export async function anchorHash(hashHex: string) {
  if (!/^[0-9a-f]{64}$/.test(hashHex)) throw new Error("Hash inválido");
  const kp = anchorKeypair();
  try {
    return await submitAnchor(kp, hashHex);
  } catch (err) {
    if (!isBadSeq(err)) throw err;
    // Otra transacción usó la secuencia: recargamos la cuenta y reintentamos una vez.
    return await submitAnchor(kp, hashHex);
  }
}
