// Integración con la extensión Freighter. Solo se usa en el navegador:
// la librería se carga bajo demanda para que nunca se ejecute en el servidor.
// QRuta nunca ve la llave privada: Freighter firma dentro de la extensión y devuelve la transacción firmada.
import { TESTNET_PASSPHRASE } from "./config";

export class FreighterError extends Error {}

const freighter = () => import("@stellar/freighter-api");

export function abreviar(direccion: string) {
  return `${direccion.slice(0, 4)}…${direccion.slice(-4)}`;
}

async function exigirInstalada() {
  const f = await freighter();
  const { isConnected } = await f.isConnected();
  if (!isConnected) {
    throw new FreighterError("No encontramos Freighter en este navegador. Instálala desde freighter.app y recarga la página.");
  }
  return f;
}

async function exigirTestnet(f: Awaited<ReturnType<typeof freighter>>) {
  const red = await f.getNetworkDetails();
  if (red.error) throw new FreighterError("No se pudo leer la red de Freighter.");
  if (red.networkPassphrase !== TESTNET_PASSPHRASE) {
    throw new FreighterError(`Freighter está en ${red.network || "otra red"}. Cámbiala a Testnet y vuelve a intentarlo.`);
  }
}

// Pide permiso al taller y devuelve la dirección pública (G...) de la cuenta activa en Freighter.
export async function conectarFreighter(): Promise<string> {
  const f = await exigirInstalada();
  const acceso = await f.requestAccess();
  if (acceso.error || !acceso.address) throw new FreighterError("No diste permiso a QRuta en Freighter.");
  await exigirTestnet(f);
  return acceso.address;
}

// Firma la transacción con la cuenta vinculada. Falla si Freighter tiene otra cuenta activa.
export async function firmarConFreighter(xdr: string, direccion: string): Promise<string> {
  const f = await exigirInstalada();
  await exigirTestnet(f);
  const activa = await f.getAddress();
  if (activa.address && activa.address !== direccion) {
    throw new FreighterError(
      `Freighter tiene activa la cuenta ${abreviar(activa.address)}. Cambia a ${abreviar(direccion)}, que es la wallet de tu taller.`,
    );
  }
  const r = await f.signTransaction(xdr, { networkPassphrase: TESTNET_PASSPHRASE, address: direccion });
  if (r.error || !r.signedTxXdr) throw new FreighterError("Cancelaste la firma en Freighter. No se registró nada.");
  return r.signedTxXdr;
}
