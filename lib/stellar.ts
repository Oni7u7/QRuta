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
