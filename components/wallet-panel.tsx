"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FreighterError, conectarFreighter } from "@/lib/freighter";
import { abreviar } from "./ui";

type Props =
  | { estado: "sin-wallet" }
  | { estado: "pendiente"; wallet: string }
  | { estado: "desconocido"; wallet: string };

const boton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 font-semibold disabled:cursor-wait disabled:opacity-70";

// Conectar la wallet de Freighter o esperar su aprobación en el contrato.
// Solo se envía a QRuta la dirección pública (G...); nunca llaves ni frases.
export function WalletPanel(props: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vincula la wallet y QRuta la activa en el contrato (el KYB del taller ya está aprobado).
  async function activar(address: string) {
    const res = await fetch("/api/taller/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const json = await res.json().catch(() => null);
    router.refresh();
    if (!res.ok) setError(json?.error ?? "No se pudo activar la wallet");
  }

  async function conectar() {
    setOcupado(true);
    setError(null);
    try {
      await activar(await conectarFreighter());
    } catch (err) {
      setError(err instanceof FreighterError ? err.message : "No se pudo conectar con Freighter.");
    } finally {
      setOcupado(false);
    }
  }

  async function reintentar() {
    if (props.estado === "sin-wallet") return;
    setOcupado(true);
    setError(null);
    try {
      await activar(props.wallet);
    } catch {
      setError("Sin conexión con el servidor. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-labelledby="wallet-titulo" className="rounded-2xl border border-linea p-6">
      {props.estado === "sin-wallet" ? (
        <>
          <h2 id="wallet-titulo" className="text-lg font-semibold">
            Conecta tu wallet para firmar
          </h2>
          <p className="mt-2 text-sm text-texto-2">
            Cada servicio se firma con tu wallet de Stellar en la extensión Freighter. QRuta solo guarda tu dirección pública;
            tu llave privada y tu frase de recuperación nunca salen de Freighter.
          </p>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-texto">
            <li>
              Instala{" "}
              <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className="font-semibold text-enlace hover:underline">
                Freighter<span className="sr-only"> (abre en otra pestaña)</span>
              </a>{" "}
              en este navegador y crea tu cuenta.
            </li>
            <li>Guarda tu frase de recuperación en un lugar seguro.</li>
            <li>En Freighter, cambia la red a <strong>Testnet</strong>.</li>
            <li>Presiona “Conectar Freighter” y acepta en la ventana de la extensión.</li>
          </ol>
          <button
            type="button"
            onClick={conectar}
            disabled={ocupado}
            className={`${boton} mt-5 bg-naranja text-grafito hover:brightness-95`}
          >
            {ocupado && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
            {ocupado ? "Conectando y activando…" : "Conectar Freighter"}
          </button>
        </>
      ) : (
        <>
          <h2 id="wallet-titulo" className="text-lg font-semibold">
            {props.estado === "pendiente" ? "Falta activar tu wallet" : "No pudimos comprobar tu wallet"}
          </h2>
          <p className="mt-2 text-sm text-texto-2">
            Wallet vinculada: <span className="font-mono font-semibold text-texto">{abreviar(props.wallet)}</span>
          </p>
          <p className="mt-2 text-sm text-texto-2">
            {props.estado === "pendiente"
              ? "Tu wallet está vinculada, pero su activación en el contrato de QRuta no se completó. Vuelve a intentarlo; tarda unos segundos."
              : "Stellar no respondió a tiempo. Intenta de nuevo en unos segundos."}
          </p>
          <button
            type="button"
            onClick={reintentar}
            disabled={ocupado}
            className={`${boton} mt-5 border border-borde hover:bg-fondo`}
          >
            {ocupado ? "Activando…" : "Activar mi wallet"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-vencido bg-superficie px-4 py-3 text-sm text-texto-vencido">
          {error}
        </p>
      )}
    </section>
  );
}
