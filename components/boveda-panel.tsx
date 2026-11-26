"use client";

import { useEffect, useState } from "react";
import {
  BovedaError,
  enviarReclamo,
  estadoBoveda,
  formatXlm,
  prepararReclamo,
  urlTx,
  type EstadoBoveda,
} from "@/lib/boveda";
import { FreighterError, conectarFreighter, firmarConFreighter } from "@/lib/freighter";
import { abreviar, inputClass } from "./ui";

const boton =
  "inline-flex h-12 w-full items-center justify-center gap-2 border-2 border-texto px-6 font-extrabold uppercase tracking-wide shadow-[4px_4px_0_0_var(--tema-texto)] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-70";

type Paso = "conectando" | "preparando" | "firmando" | "enviando";
const TEXTO_PASO: Record<Paso, string> = {
  conectando: "Conectando Freighter…",
  preparando: "Revisando el código en el contrato…",
  firmando: "Firma en Freighter…",
  enviando: "Abriendo la bóveda en Stellar…",
};

export function BovedaPanel() {
  const [estado, setEstado] = useState<EstadoBoveda | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [paso, setPaso] = useState<Paso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<{ hash: string; monto: bigint } | null>(null);

  async function actualizar() {
    try {
      setEstado(await estadoBoveda());
    } catch {
      setEstado(null);
    }
  }

  useEffect(() => {
    actualizar();
  }, []);

  async function conectar() {
    setError(null);
    setPaso("conectando");
    try {
      setWallet(await conectarFreighter());
    } catch (err) {
      setError(err instanceof FreighterError ? err.message : "No se pudo conectar con Freighter.");
    } finally {
      setPaso(null);
    }
  }

  async function reclamar(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    setError(null);
    try {
      const monto = estado?.saldo ?? BigInt(0);
      setPaso("preparando");
      const xdr = await prepararReclamo(wallet, codigo.trim());
      setPaso("firmando");
      const firmado = await firmarConFreighter(xdr, wallet);
      setPaso("enviando");
      const hash = await enviarReclamo(firmado);
      setTx({ hash, monto });
      await actualizar();
    } catch (err) {
      setError(
        err instanceof BovedaError || err instanceof FreighterError ? err.message : "Algo falló. Revisa tu conexión e intenta de nuevo.",
      );
    } finally {
      setPaso(null);
    }
  }

  if (tx) {
    return (
      <section aria-live="polite" className="border-2 border-texto bg-superficie p-6 shadow-[6px_6px_0_0_var(--tema-texto)]">
        <p className="font-mono text-sm font-bold uppercase text-vigente">Bóveda abierta</p>
        <h2 className="mt-2 text-3xl font-extrabold uppercase">{formatXlm(tx.monto)} enviados</h2>
        <p className="mt-2 text-texto-2">Llegaron a tu wallet {abreviar(wallet ?? "")} en Stellar testnet.</p>
        <a href={urlTx(tx.hash)} target="_blank" rel="noopener noreferrer" className={`${boton} mt-6 bg-naranja text-grafito`}>
          Ver la transacción<span className="sr-only"> (abre en otra pestaña)</span>
        </a>
      </section>
    );
  }

  const abierta = Boolean(estado?.abiertaPor);

  return (
    <section className="border-2 border-texto bg-superficie p-6 shadow-[6px_6px_0_0_var(--tema-texto)]">
      <dl className="grid grid-cols-2 gap-4 border-b-2 border-texto pb-5">
        <div>
          <dt className="font-mono text-xs uppercase text-texto-2">Saldo</dt>
          <dd className="mt-1 text-2xl font-extrabold">{estado ? formatXlm(estado.saldo) : "…"}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase text-texto-2">Estado</dt>
          <dd className={`mt-1 text-2xl font-extrabold uppercase ${abierta ? "text-vencido" : "text-vigente"}`}>
            {estado ? (abierta ? "Abierta" : "Cerrada") : "…"}
          </dd>
        </div>
      </dl>

      {abierta ? (
        <p className="mt-5 text-texto-2">
          Ya la abrió la wallet <span className="font-mono">{abreviar(estado!.abiertaPor!)}</span>.
        </p>
      ) : !wallet ? (
        <div className="mt-5">
          <p className="text-texto-2">
            Conecta tu wallet de <strong>Freighter en Testnet</strong>. Si tu cuenta todavía no existe en testnet, la fondeamos con
            Friendbot al reclamar.
          </p>
          <button type="button" onClick={conectar} disabled={paso !== null} className={`${boton} mt-5 bg-naranja text-grafito`}>
            {paso ? TEXTO_PASO[paso] : "Conectar Freighter"}
          </button>
        </div>
      ) : (
        <form onSubmit={reclamar} className="mt-5">
          <p className="text-sm text-texto-2">
            Wallet conectada: <span className="font-mono">{abreviar(wallet)}</span>
          </p>
          <label htmlFor="codigo" className="mt-4 block font-mono text-xs font-bold uppercase">
            Código de la bóveda
          </label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            required
            maxLength={64}
            autoComplete="off"
            className={`${inputClass} mt-2`}
            placeholder="Escribe el código"
          />
          <button type="submit" disabled={paso !== null || !codigo.trim()} className={`${boton} mt-5 bg-naranja text-grafito`}>
            {paso ? TEXTO_PASO[paso] : "Abrir bóveda"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 border-2 border-vencido p-3 text-sm font-semibold text-vencido">
          {error}
        </p>
      )}
    </section>
  );
}
