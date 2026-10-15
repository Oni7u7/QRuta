// KYB on-chain: aprueba, suspende o consulta la wallet de un taller en el contrato qruta-registry.
//
// Uso:
//   node --env-file=.env.local scripts/taller-contrato.mts estado    --email taller@ejemplo.com
//   node --env-file=.env.local scripts/taller-contrato.mts aprobar   --email taller@ejemplo.com
//   node --env-file=.env.local scripts/taller-contrato.mts suspender --email taller@ejemplo.com
//
// - aprobar: exige que el taller esté 'aprobado' en la base (KYB revisado) y tenga su wallet vinculada.
// - suspender: lo suspende en el contrato y en la base. Sus expedientes anteriores siguen siendo válidos.
// Firma la cuenta admin del contrato (STELLAR_SECRET).

import { createClient } from "@supabase/supabase-js";
import { Address, Contract, Keypair, Networks, TransactionBuilder, rpc, scValToNative } from "@stellar/stellar-sdk";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { email: { type: "string" } },
});
const accion = positionals[0];
const email = values.email?.trim().toLowerCase();
if (!["estado", "aprobar", "suspender"].includes(accion ?? "") || !email) {
  console.error("Uso: scripts/taller-contrato.mts <estado|aprobar|suspender> --email taller@ejemplo.com");
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STELLAR_SECRET, QRUTA_CONTRACT_ID } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STELLAR_SECRET || !QRUTA_CONTRACT_ID) {
  console.error("Faltan variables (SUPABASE_*, STELLAR_SECRET o QRUTA_CONTRACT_ID). Usa --env-file=.env.local");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const server = new rpc.Server("https://soroban-testnet.stellar.org");
const contrato = new Contract(QRUTA_CONTRACT_ID);
const admin = Keypair.fromSecret(STELLAR_SECRET);

// 1. Taller por correo.
let userId: string | undefined;
for (let page = 1; !userId; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(error.message);
  userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (data.users.length < 1000) break;
}
if (!userId) {
  console.error(`No hay ningún usuario con el correo ${email}`);
  process.exit(1);
}
const { data: taller } = await sb.from("talleres").select("id, nombre, estado, stellar_address").eq("id", userId).maybeSingle();
if (!taller) {
  console.error(`${email} no es un taller (no tiene fila en la tabla talleres)`);
  process.exit(1);
}

async function esAprobado(direccion: string) {
  const fuente = await server.getAccount(admin.publicKey());
  const tx = new TransactionBuilder(fuente, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(contrato.call("es_aprobado", new Address(direccion).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return Boolean(sim.result && scValToNative(sim.result.retval));
}

async function invocarComoAdmin(fn: string, direccion: string) {
  const fuente = await server.getAccount(admin.publicKey());
  const tx = new TransactionBuilder(fuente, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(contrato.call(fn, new Address(direccion).toScVal()))
    .setTimeout(60)
    .build();
  const preparada = await server.prepareTransaction(tx);
  preparada.sign(admin);
  const envio = await server.sendTransaction(preparada);
  if (envio.status === "ERROR" || envio.status === "TRY_AGAIN_LATER") throw new Error(`Envío rechazado: ${envio.status}`);
  const final = await server.pollTransaction(envio.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`La transacción terminó en ${final.status}`);
  return envio.hash;
}

console.log(`Taller: ${taller.nombre} <${email}>`);
console.log(`  KYB en la base: ${taller.estado}`);
console.log(`  Wallet:         ${taller.stellar_address ?? "(sin vincular)"}`);
if (taller.stellar_address) console.log(`  En el contrato: ${(await esAprobado(taller.stellar_address)) ? "aprobada" : "no aprobada"}`);

if (accion === "estado") process.exit(0);

if (!taller.stellar_address) {
  console.error("\nEl taller aún no vincula su wallet. Pídele que la conecte en /taller.");
  process.exit(1);
}

if (accion === "aprobar") {
  if (taller.estado !== "aprobado") {
    console.error("\nEl KYB del taller no está aprobado en la base. Revísalo antes de aprobar su wallet.");
    process.exit(1);
  }
  const hash = await invocarComoAdmin("aprobar_taller", taller.stellar_address);
  console.log(`\nWallet aprobada en el contrato.\n  https://stellar.expert/explorer/testnet/tx/${hash}`);
}

if (accion === "suspender") {
  const hash = await invocarComoAdmin("suspender_taller", taller.stellar_address);
  await sb.from("talleres").update({ estado: "suspendido" }).eq("id", taller.id);
  console.log(`\nTaller suspendido en el contrato y en la base.\n  https://stellar.expert/explorer/testnet/tx/${hash}`);
}
