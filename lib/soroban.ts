import {
  Account,
  Address,
  Contract,
  Keypair,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { RED_STELLAR, contractId, sorobanRpcUrl, type Tipo } from "./config";

// Cliente del contrato qruta-registry (solo servidor).

// Se crea al primer uso: si falta STELLAR_RPC_URL en mainnet, falla la petición y no la carga del módulo.
let cliente: rpc.Server | undefined;
function servidor() {
  cliente ??= new rpc.Server(sorobanRpcUrl());
  return cliente;
}

const PASSPHRASE = RED_STELLAR.passphrase;

// Tiempo que tiene el taller para firmar en Freighter antes de que la transacción caduque.
const TIEMPO_PARA_FIRMAR_S = 300;

// Errores del contrato (src/lib.rs, enum Error) traducidos para el taller.
const ERRORES_CONTRATO: Record<number, string> = {
  1: "Tu wallet todavía no está aprobada en el contrato de QRuta.",
  2: "La placa no es válida para el contrato.",
  3: "El tipo de servicio no es válido para el contrato.",
  4: "La vigencia del servicio no es válida.",
  5: "Este expediente ya está registrado en el contrato.",
  6: "La fecha del servicio no puede estar en el futuro.",
  7: "Esta placa no tiene servicios en el contrato.",
  8: "El expediente no existe en el contrato.",
  9: "Este expediente fue anulado en el contrato.",
  10: "El motivo debe tener entre 3 y 200 caracteres.",
  11: "Solo el taller que firmó el expediente puede corregirlo.",
  12: "Este expediente ya fue corregido.",
  13: "Ya reportaste esta unidad hoy.",
  14: "Esta unidad no tiene reportes pendientes.",
  15: "El expediente es de otra placa.",
  16: "El servicio debe ser posterior al primer reporte.",
  17: "Un taller no puede hacer esto sobre su propio expediente o consigo mismo.",
  18: "Este expediente ya tiene el aval de otro taller.",
  19: "Solo el taller responsable de la unidad puede transferirla.",
  20: "El lote debe tener entre 1 y 10 expedientes.",
};

export class SorobanError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function errorDeContrato(detalle: string) {
  const m = /Error\(Contract, #(\d+)\)/.exec(detalle);
  return m ? ERRORES_CONTRATO[Number(m[1])] : undefined;
}

export function esDireccionStellar(s: string) {
  return StrKey.isValidEd25519PublicKey(s);
}

export type ArgsRegistro = {
  taller: string;
  placa: string;
  hashHex: string;
  tipo: Tipo;
  fechaUnix: number;
  vigenteHastaUnix: number;
};

function argsRegistrar(a: ArgsRegistro): xdr.ScVal[] {
  return [
    new Address(a.taller).toScVal(),
    nativeToScVal(a.placa, { type: "string" }),
    xdr.ScVal.scvBytes(Buffer.from(a.hashHex, "hex")),
    nativeToScVal(a.tipo, { type: "symbol" }),
    nativeToScVal(BigInt(a.fechaUnix), { type: "u64" }),
    nativeToScVal(BigInt(a.vigenteHastaUnix), { type: "u64" }),
  ];
}

// ── Cuenta del taller ──────────────────────────────────────────────

export async function cuentaExiste(direccion: string) {
  try {
    await servidor().getAccount(direccion);
    return true;
  } catch {
    return false;
  }
}

// Si la cuenta todavía no existe, en testnet la fondea con Friendbot.
// En mainnet no hay Friendbot: el taller debe crearla con XLM antes de vincularla.
export async function asegurarCuenta(direccion: string) {
  if (await cuentaExiste(direccion)) return "existente" as const;
  if (!RED_STELLAR.friendbot) {
    throw new SorobanError(
      `Tu wallet todavía no existe en ${RED_STELLAR.nombre}. Recíbele XLM para activarla y vuelve a intentarlo.`,
      409,
    );
  }
  await servidor().fundAddress(direccion);
  return "fondeada" as const;
}

// ── Lecturas (simulación: gratis y sin firma) ──────────────────────

async function leer(fn: string, ...args: xdr.ScVal[]) {
  // La simulación no consume la secuencia: basta una cuenta fuente cualquiera.
  const fuente = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(fuente, { fee: "100", networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(contractId()).call(fn, ...args))
    .setTimeout(30)
    .build();
  const sim = await servidor().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`Simulación de ${fn} falló: ${sim.error.slice(0, 200)}`);
  return sim.result ? scValToNative(sim.result.retval) : undefined;
}

export async function esAprobadoOnChain(direccion: string): Promise<boolean> {
  return Boolean(await leer("es_aprobado", new Address(direccion).toScVal()));
}

export type RegistroOnChain = {
  placa: string;
  taller: string;
  tipo: string;
  fecha: number;
  vigente_hasta: number;
  ledger: number;
};

export async function expedienteOnChain(hashHex: string): Promise<RegistroOnChain | null> {
  const r = await leer("expediente", xdr.ScVal.scvBytes(Buffer.from(hashHex, "hex")));
  if (!r) return null;
  return {
    placa: String(r.placa),
    taller: String(r.taller),
    tipo: String(r.tipo),
    fecha: Number(r.fecha),
    vigente_hasta: Number(r.vigente_hasta),
    ledger: Number(r.ledger),
  };
}

// ── Registro firmado por el taller ─────────────────────────────────

// Arma y simula `registrar`. Devuelve el XDR listo para que el taller lo firme en Freighter.
export async function prepararRegistro(a: ArgsRegistro): Promise<string> {
  let cuenta;
  try {
    cuenta = await servidor().getAccount(a.taller);
  } catch {
    throw new SorobanError(`Tu wallet no existe en ${RED_STELLAR.nombre}. Vuelve a conectarla para activarla.`, 409);
  }
  const tx = new TransactionBuilder(cuenta, { fee: "100", networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(contractId()).call("registrar", ...argsRegistrar(a)))
    .setTimeout(TIEMPO_PARA_FIRMAR_S)
    .build();
  try {
    // Simula, calcula recursos y comisión, y adjunta la autorización.
    const preparada = await servidor().prepareTransaction(tx);
    return preparada.toXDR();
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    const amigable = errorDeContrato(detalle);
    if (amigable) throw new SorobanError(amigable, 409);
    throw new SorobanError("No se pudo preparar el registro en Stellar. Intenta de nuevo.", 502);
  }
}

// Comprueba que la transacción firmada sea exactamente la llamada que QRuta preparó
// y que la firma sea válida y del taller.
export function validarRegistroFirmado(signedXdr: string, a: ArgsRegistro): Transaction {
  let tx: Transaction;
  try {
    const parsed = TransactionBuilder.fromXDR(signedXdr, PASSPHRASE);
    if (!(parsed instanceof Transaction)) throw new Error("fee bump");
    tx = parsed;
  } catch {
    throw new SorobanError("La transacción firmada no es válida.", 400);
  }

  const invalida = () => new SorobanError("La transacción firmada no corresponde a este expediente.", 400);
  if (tx.source !== a.taller || tx.operations.length !== 1) throw invalida();
  const op = tx.operations[0];
  if (op.type !== "invokeHostFunction") throw invalida();
  const fn = op.func;
  if (fn.type !== "hostFunctionTypeInvokeContract") throw invalida();
  const ic = fn.invokeContract;
  if (Address.fromScAddress(ic.contractAddress).toString() !== contractId()) throw invalida();
  if (ic.functionName.toString() !== "registrar") throw invalida();
  const esperados = argsRegistrar(a).map((v) => v.toXDR("base64"));
  const recibidos = ic.args.map((v) => v.toXDR("base64"));
  if (esperados.length !== recibidos.length || esperados.some((v, i) => v !== recibidos[i])) throw invalida();

  const kp = Keypair.fromPublicKey(a.taller);
  const pista = Buffer.from(kp.signatureHint());
  const firmada = tx.signatures.some(
    (s) => Buffer.from(s.hint.value).equals(pista) && kp.verify(tx.hash(), s.signature),
  );
  if (!firmada) throw new SorobanError("La transacción no está firmada por tu wallet.", 400);
  return tx;
}

// Envía la transacción y espera a que la red la confirme. Devuelve el hash de la transacción.
export async function enviarYConfirmar(tx: Transaction): Promise<string> {
  const envio = await servidor().sendTransaction(tx);
  if (envio.status === "ERROR") {
    const detalle = envio.errorResult?.toXDR("base64") ?? "";
    console.error("Soroban rechazó la transacción:", envio.hash, detalle.slice(0, 120));
    throw new SorobanError("Stellar rechazó la transacción. Prepara el registro de nuevo.", 502);
  }
  if (envio.status === "TRY_AGAIN_LATER") {
    throw new SorobanError("La red está ocupada. Intenta de nuevo en unos segundos.", 503);
  }
  const final = await servidor().pollTransaction(envio.hash, { attempts: 20 });
  if (final.status === rpc.Api.GetTransactionStatus.SUCCESS) return envio.hash;
  if (final.status === rpc.Api.GetTransactionStatus.FAILED) {
    console.error("Transacción fallida en el contrato:", envio.hash);
    throw new SorobanError("El contrato rechazó el registro.", 409);
  }
  throw new SorobanError("Stellar tardó demasiado en confirmar. Revisa más tarde en Stellar Expert.", 504);
}

// ── KYB on-chain (firma la cuenta admin del contrato, desde el servidor) ──

function adminKeypair() {
  const secret = process.env.STELLAR_SECRET;
  if (!secret) throw new Error("Falta STELLAR_SECRET");
  return Keypair.fromSecret(secret);
}

async function invocarComoAdmin(fn: "aprobar_taller" | "suspender_taller", direccion: string): Promise<string> {
  const admin = adminKeypair();
  const cuenta = await servidor().getAccount(admin.publicKey());
  const tx = new TransactionBuilder(cuenta, { fee: "100", networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(contractId()).call(fn, new Address(direccion).toScVal()))
    .setTimeout(60)
    .build();
  let preparada: Transaction;
  try {
    preparada = await servidor().prepareTransaction(tx);
  } catch (err) {
    console.error(`Simulación de ${fn} falló:`, err instanceof Error ? err.message.slice(0, 200) : err);
    throw new SorobanError("No se pudo preparar la operación en el contrato. Intenta de nuevo.", 502);
  }
  preparada.sign(admin);
  return enviarYConfirmar(preparada);
}

// Aprueba una wallet de taller en el contrato. Idempotente: aprobar dos veces no cambia nada.
export function aprobarTallerOnChain(direccion: string) {
  return invocarComoAdmin("aprobar_taller", direccion);
}

// Suspende una wallet: ya no puede firmar expedientes nuevos; los anteriores siguen válidos.
export function suspenderTallerOnChain(direccion: string) {
  return invocarComoAdmin("suspender_taller", direccion);
}
