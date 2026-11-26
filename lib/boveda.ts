// Bóveda del reto exprés "Bóveda" (Ship It, 26 nov 2026). Contrato: contracts/qruta-boveda.
// Siempre en testnet, sin importar NEXT_PUBLIC_STELLAR_NETWORK: los XLM de la bóveda son de prueba.
// Se usa desde el navegador: el reclamo lo firma la wallet de quien reclama en Freighter.
import {
  Account,
  Address,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  type xdr,
} from "@stellar/stellar-sdk";
import { configRed } from "./config";

// La primera bóveda (CA2LMHZ…DTUY) ya se abrió en una prueba; esta es la vigente.
export const BOVEDA_CONTRACT_ID = "CBV7KCBOT4ULGUQZOR3KAIBSGYQQ3YMHZOJNUFITJ26LMX5QKR5FABVP";
export const BOVEDA_RED = configRed("testnet");
export const STROOPS_POR_XLM = BigInt(10_000_000);

const ERRORES: Record<number, string> = {
  1: "Ese no es el código. Revisa mayúsculas y espacios.",
  2: "La bóveda ya se abrió: alguien llegó primero.",
  3: "Monto inválido.",
  4: "La bóveda está vacía.",
};

export class BovedaError extends Error {}

function servidor() {
  return new rpc.Server(BOVEDA_RED.rpcUrl!);
}

function contrato() {
  return new Contract(BOVEDA_CONTRACT_ID);
}

function traducir(detalle: string) {
  const m = /Error\(Contract, #(\d+)\)/.exec(detalle);
  return m ? ERRORES[Number(m[1])] : undefined;
}

async function leer(fn: string): Promise<unknown> {
  const fuente = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(fuente, { fee: "100", networkPassphrase: BOVEDA_RED.passphrase })
    .addOperation(contrato().call(fn))
    .setTimeout(30)
    .build();
  const sim = await servidor().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new BovedaError("No se pudo leer la bóveda.");
  return sim.result ? scValToNative(sim.result.retval) : undefined;
}

export type EstadoBoveda = { saldo: bigint; abiertaPor: string | null };

export async function estadoBoveda(): Promise<EstadoBoveda> {
  const [saldo, abiertaPor] = await Promise.all([leer("saldo"), leer("abierta_por")]);
  return { saldo: BigInt(saldo as bigint | number), abiertaPor: (abiertaPor as string | undefined) ?? null };
}

export function formatXlm(stroops: bigint) {
  const entero = stroops / STROOPS_POR_XLM;
  return `${entero.toLocaleString("es-MX")} XLM`;
}

// Si la wallet no existe en testnet, la fondea con Friendbot (solo testnet) para que pueda firmar.
async function cuentaFuente(direccion: string) {
  const s = servidor();
  try {
    return await s.getAccount(direccion);
  } catch {
    await s.fundAddress(direccion);
    return await s.getAccount(direccion);
  }
}

// Arma y simula `reclamar(destino, codigo)`. Devuelve el XDR para firmar en Freighter.
export async function prepararReclamo(direccion: string, codigo: string): Promise<string> {
  const cuenta = await cuentaFuente(direccion);
  const args: xdr.ScVal[] = [new Address(direccion).toScVal(), nativeToScVal(codigo, { type: "string" })];
  const tx = new TransactionBuilder(cuenta, { fee: "100", networkPassphrase: BOVEDA_RED.passphrase })
    .addOperation(contrato().call("reclamar", ...args))
    .setTimeout(300)
    .build();
  try {
    return (await servidor().prepareTransaction(tx)).toXDR();
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    throw new BovedaError(traducir(detalle) ?? "No se pudo preparar el reclamo. Intenta de nuevo.");
  }
}

// Envía la transacción firmada y espera la confirmación. Devuelve el hash.
export async function enviarReclamo(xdrFirmado: string): Promise<string> {
  const s = servidor();
  const tx = TransactionBuilder.fromXDR(xdrFirmado, BOVEDA_RED.passphrase);
  const envio = await s.sendTransaction(tx);
  if (envio.status === "ERROR" || envio.status === "TRY_AGAIN_LATER") {
    throw new BovedaError("Stellar rechazó la transacción. Intenta de nuevo.");
  }
  const final = await s.pollTransaction(envio.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new BovedaError("El contrato rechazó el reclamo. Revisa el código e intenta de nuevo.");
  }
  return envio.hash;
}

export function urlTx(hash: string) {
  return `${BOVEDA_RED.exploradorUrl}/tx/${hash}`;
}

export function urlContrato() {
  return `${BOVEDA_RED.exploradorUrl}/contract/${BOVEDA_CONTRACT_ID}`;
}
