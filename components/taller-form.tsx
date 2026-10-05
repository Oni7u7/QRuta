"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TIPOS, TIPO_LABEL, VIGENCIA_DIAS, type Tipo } from "@/lib/config";

type Resultado = {
  placa: string;
  tipo: Tipo;
  fecha: string;
  firmado_por: string;
  vigente_hasta: string;
  hash: string;
  tx_hash: string;
  stellar_expert: string;
};

// Fecha local de hoy en formato YYYY-MM-DD.
function hoy() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base placeholder:text-zinc-400 focus:border-teal-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-teal-400";

export function TallerForm() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // La página se prerenderiza: la fecha de hoy se calcula ya en el navegador.
  const [fechaHoy, setFechaHoy] = useState("");
  useEffect(() => setFechaHoy(hoy()), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/expedientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "No se pudo registrar el servicio");
        return;
      }
      setResultado(json);
    } catch {
      setError("Sin conexión con el servidor. Revisa tu red e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <section aria-live="polite" className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h2 className="font-semibold">Servicio registrado y anclado</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">La transacción ya está en Stellar testnet.</p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {[
            ["Placa", resultado.placa],
            ["Servicio", TIPO_LABEL[resultado.tipo]],
            ["Fecha", formatFecha(resultado.fecha)],
            ["Vigente hasta", formatFecha(resultado.vigente_hasta)],
            ["Firmado por", resultado.firmado_por],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
          <div className="py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">Hash SHA-256</dt>
            <dd className="mt-1 font-mono text-xs break-all">{resultado.hash}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/pantalla?p=${resultado.placa}`}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-600 px-5 font-medium text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
          >
            Abrir pantalla de la unidad
          </Link>
          <a
            href={resultado.stellar_expert}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Ver en Stellar Expert
            <span className="sr-only"> (abre en otra pestaña)</span>
          </a>
        </div>
        <button
          type="button"
          onClick={() => setResultado(null)}
          className="mt-4 text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
        >
          Registrar otro servicio
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="placa" className="text-sm font-medium">
          Placa de la unidad
        </label>
        <input
          id="placa"
          name="placa"
          required
          minLength={3}
          maxLength={12}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ABC-123"
          className={`${inputClass} uppercase`}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="tipo" className="text-sm font-medium">
            Tipo de servicio
          </label>
          <select id="tipo" name="tipo" required defaultValue="preventivo" className={inputClass}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]} · {VIGENCIA_DIAS[t]} días
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fecha" className="text-sm font-medium">
            Fecha del servicio
          </label>
          <input id="fecha" name="fecha" type="date" required key={fechaHoy} defaultValue={fechaHoy} max={fechaHoy || undefined} className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="notas" className="text-sm font-medium">
          Notas <span className="font-normal text-zinc-500 dark:text-zinc-400">(opcional)</span>
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={3}
          maxLength={1000}
          placeholder="Cambio de aceite y filtros, revisión de frenos…"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="firmado_por" className="text-sm font-medium">
          Taller que firma
        </label>
        <input
          id="firmado_por"
          name="firmado_por"
          required
          minLength={2}
          maxLength={80}
          autoComplete="organization"
          placeholder="Taller Hernández"
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 font-medium text-white hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70 sm:w-auto dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
      >
        {enviando && (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        )}
        {enviando ? "Anclando en Stellar…" : "Firmar y registrar"}
      </button>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Al firmar, el hash del expediente se publica en Stellar testnet y ya no se puede modificar.
      </p>
    </form>
  );
}
