"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CHECKLIST_ITEMS,
  CHECK_LABEL,
  CHECK_VALORES,
  TIPOS,
  TIPO_LABEL,
  VIGENCIA_DIAS,
  type CheckValor,
  type Checklist,
  type ChecklistKey,
  type Tipo,
} from "@/lib/config";
import { ChecklistView } from "./checklist-view";
import { formatFecha, inputClass } from "./ui";

type Resultado = {
  placa: string;
  tipo: Tipo;
  fecha: string;
  kilometraje: number;
  checklist: Checklist;
  firmado_por: string;
  vigente_hasta: string;
  hash: string;
  stellar_expert: string;
};

// Fecha local de hoy en formato YYYY-MM-DD.
function hoy() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const SEGMENTO: Record<CheckValor, string> = {
  ok: "peer-checked:border-teal-600 peer-checked:bg-teal-600 peer-checked:text-white dark:peer-checked:border-teal-500 dark:peer-checked:bg-teal-500 dark:peer-checked:text-zinc-950",
  atencion:
    "peer-checked:border-amber-500 peer-checked:bg-amber-500 peer-checked:text-zinc-950 dark:peer-checked:border-amber-400 dark:peer-checked:bg-amber-400",
  falla:
    "peer-checked:border-red-600 peer-checked:bg-red-600 peer-checked:text-white dark:peer-checked:border-red-500 dark:peer-checked:bg-red-500 dark:peer-checked:text-zinc-950",
};

export function TallerForm({ tallerNombre }: { tallerNombre: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [checklist, setChecklist] = useState<Partial<Checklist>>({});
  // La fecha de hoy se calcula en el navegador (huso horario del taller).
  const [fechaHoy, setFechaHoy] = useState("");
  useEffect(() => setFechaHoy(hoy()), []);

  const hayFallas = Object.values(checklist).includes("falla");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const km = String(form.get("kilometraje") ?? "").trim();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/expedientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: form.get("placa"),
          tipo: form.get("tipo"),
          fecha: form.get("fecha"),
          kilometraje: km === "" ? null : Number(km),
          checklist,
          notas: form.get("notas") ?? "",
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        router.push("/login?next=/taller");
        return;
      }
      if (!res.ok) {
        setError(json?.error ?? "No se pudo registrar el servicio");
        return;
      }
      setResultado(json);
      setChecklist({});
      router.refresh(); // actualiza "Tus últimos servicios"
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
            ["Kilometraje", `${resultado.kilometraje.toLocaleString("es-MX")} km`],
            ["Vigente hasta", formatFecha(resultado.vigente_hasta)],
            ["Firmado por", resultado.firmado_por],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4">
          <ChecklistView checklist={resultado.checklist} />
        </div>
        <div className="mt-4 text-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Hash SHA-256</p>
          <p className="mt-1 font-mono text-xs break-all">{resultado.hash}</p>
        </div>

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
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
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
        <div>
          <label htmlFor="kilometraje" className="text-sm font-medium">
            Kilometraje
          </label>
          <input
            id="kilometraje"
            name="kilometraje"
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={5000000}
            step={1}
            placeholder="185000"
            className={inputClass}
          />
        </div>
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
          <input
            id="fecha"
            name="fecha"
            type="date"
            required
            key={fechaHoy}
            defaultValue={fechaHoy}
            max={fechaHoy || undefined}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Checklist de revisión</legend>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Marca el estado de cada componente.</p>
        <div className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {CHECKLIST_ITEMS.map(({ key, label }) => (
            <div key={key} role="radiogroup" aria-label={label} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-sm">{label}</span>
              <div className="flex gap-1.5">
                {CHECK_VALORES.map((v) => (
                  <label key={v} className="cursor-pointer">
                    <input
                      type="radio"
                      name={`check-${key}`}
                      value={v}
                      required
                      checked={checklist[key as ChecklistKey] === v}
                      onChange={() => setChecklist((c) => ({ ...c, [key]: v }))}
                      className="peer sr-only"
                    />
                    <span
                      className={`inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-lg border border-zinc-300 px-2 text-xs font-medium text-zinc-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600 dark:border-zinc-700 dark:text-zinc-300 ${SEGMENTO[v]}`}
                    >
                      {CHECK_LABEL[v]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {hayFallas && (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Hay componentes con falla. Quedarán visibles en la verificación pública; registra un servicio correctivo cuando se
            reparen.
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor="notas" className="text-sm font-medium">
          Notas <span className="font-normal text-zinc-500 dark:text-zinc-400">(opcional, solo visibles para talleres)</span>
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={3}
          maxLength={1000}
          placeholder="Cambio de aceite y filtros, balatas delanteras al 40 %…"
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900">
        <span className="text-zinc-500 dark:text-zinc-400">Firma como </span>
        <span className="font-medium">{tallerNombre}</span>
        <span className="ml-1 text-teal-700 dark:text-teal-400">· taller verificado</span>
      </div>

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
        Al firmar, el hash del expediente (incluido el checklist) se publica en Stellar testnet y ya no se puede modificar.
      </p>
    </form>
  );
}
