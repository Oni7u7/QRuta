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
import { FreighterError, firmarConFreighter } from "@/lib/freighter";
import { ChecklistView } from "./checklist-view";
import { abreviar, formatFecha, inputClass } from "./ui";

type Resultado = {
  placa: string;
  tipo: Tipo;
  fecha: string;
  kilometraje: number;
  checklist: Checklist;
  firmado_por: string;
  firmado_con: string;
  vigente_hasta: string;
  hash: string;
  stellar_expert: string;
  contrato: string;
};

type Paso = "preparando" | "firmando" | "registrando";

const TEXTO_PASO: Record<Paso, string> = {
  preparando: "Preparando el registro…",
  firmando: "Firma en Freighter…",
  registrando: "Registrando en Stellar…",
};

// Fecha local de hoy en formato YYYY-MM-DD.
function hoy() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const SEGMENTO: Record<CheckValor, string> = {
  ok: "peer-checked:border-vigente peer-checked:bg-vigente peer-checked:text-blanco",
  atencion:
    "peer-checked:border-por-vencer peer-checked:bg-por-vencer peer-checked:text-grafito",
  falla:
    "peer-checked:border-vencido peer-checked:bg-vencido peer-checked:text-blanco",
};

// Formulario del taller con wallet aprobada. El registro va en dos pasos:
// QRuta prepara la transacción, el taller la firma en Freighter y QRuta la envía al contrato.
export function TallerForm({ tallerNombre, wallet }: { tallerNombre: string; wallet: string }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso | null>(null);
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
    // Los mismos datos van a "preparar" y a "registrar": el servidor recalcula el hash en ambos.
    const datos = {
      placa: form.get("placa"),
      tipo: form.get("tipo"),
      fecha: form.get("fecha"),
      kilometraje: km === "" ? null : Number(km),
      checklist,
      notas: form.get("notas") ?? "",
    };
    const post = async (url: string, body: unknown) => {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { res, json: await res.json().catch(() => null) };
    };
    setError(null);
    try {
      // 1. QRuta arma y simula la llamada al contrato.
      setPaso("preparando");
      const prep = await post("/api/expedientes/preparar", datos);
      if (prep.res.status === 401) return router.push("/login?next=/taller");
      if (!prep.res.ok) return setError(prep.json?.error ?? "No se pudo preparar el registro");

      // 2. El taller firma en Freighter (la llave nunca sale de la extensión).
      setPaso("firmando");
      const signedXdr = await firmarConFreighter(prep.json.xdr, wallet);

      // 3. QRuta comprueba la firma, la envía al contrato y guarda el expediente.
      setPaso("registrando");
      const reg = await post("/api/expedientes", { ...datos, signedXdr });
      if (reg.res.status === 401) return router.push("/login?next=/taller");
      if (!reg.res.ok) return setError(reg.json?.error ?? "No se pudo registrar el servicio");
      setResultado(reg.json);
      setChecklist({});
      router.refresh(); // actualiza "Tus últimos servicios"
    } catch (err) {
      setError(err instanceof FreighterError ? err.message : "Sin conexión con el servidor. Revisa tu red e intenta de nuevo.");
    } finally {
      setPaso(null);
    }
  }

  if (resultado) {
    return (
      <section aria-live="polite" className="rounded-2xl border border-linea p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-vigente text-blanco">
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h2 className="font-semibold">Servicio firmado y registrado</h2>
            <p className="text-sm text-texto-2">Quedó en el contrato de QRuta en Stellar testnet.</p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-linea text-sm">
          {[
            ["Placa", resultado.placa],
            ["Servicio", TIPO_LABEL[resultado.tipo]],
            ["Fecha", formatFecha(resultado.fecha)],
            ["Kilometraje", `${resultado.kilometraje.toLocaleString("es-MX")} km`],
            ["Vigente hasta", formatFecha(resultado.vigente_hasta)],
            ["Firmado por", resultado.firmado_por],
            ["Wallet que firmó", abreviar(resultado.firmado_con)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-texto-2">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4">
          <ChecklistView checklist={resultado.checklist} />
        </div>
        <div className="mt-4 text-sm">
          <p className="text-texto-2">Hash SHA-256</p>
          <p className="mt-1 font-mono text-xs break-all">{resultado.hash}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/pantalla?p=${resultado.placa}`}
            className="btn-primario"
          >
            Abrir pantalla de la unidad
          </Link>
          <a
            href={resultado.stellar_expert}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secundario"
          >
            Ver transacción
            <span className="sr-only"> en Stellar Expert (abre en otra pestaña)</span>
          </a>
        </div>
        <a
          href={resultado.contrato}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm text-texto-2 underline-offset-4 hover:underline"
        >
          Ver el contrato de QRuta en Stellar Expert<span className="sr-only"> (abre en otra pestaña)</span>
        </a>
        <button
          type="button"
          onClick={() => setResultado(null)}
          className="mt-4 text-sm font-semibold text-enlace hover:underline"
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
          <label htmlFor="placa" className="text-sm font-semibold">
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
          <label htmlFor="kilometraje" className="text-sm font-semibold">
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
          <label htmlFor="tipo" className="text-sm font-semibold">
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
          <label htmlFor="fecha" className="text-sm font-semibold">
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
        <legend className="text-sm font-semibold">Checklist de revisión</legend>
        <p className="mt-0.5 text-xs text-texto-2">Marca el estado de cada componente.</p>
        <div className="mt-3 divide-y divide-linea rounded-xl border border-linea">
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
                      className={`inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-lg border border-borde px-2 text-xs font-semibold text-texto-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-texto ${SEGMENTO[v]}`}
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
          <p role="status" className="mt-3 rounded-lg bg-por-vencer px-3 py-2 text-sm text-grafito">
            Hay componentes con falla. Quedarán visibles en la verificación pública; registra un servicio correctivo cuando se
            reparen.
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor="notas" className="text-sm font-semibold">
          Notas <span className="font-normal text-texto-2">(opcional, solo visibles para talleres)</span>
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
        <p role="alert" className="rounded-lg border border-vencido bg-superficie px-4 py-3 text-sm text-texto-vencido">
          {error}
        </p>
      )}

      <div className="rounded-lg bg-fondo px-4 py-3 text-sm">
        <span className="text-texto-2">Firma como </span>
        <span className="font-semibold">{tallerNombre}</span>
        <span className="text-texto-2"> con tu wallet </span>
        <span className="font-mono font-semibold">{abreviar(wallet)}</span>
        <span className="ml-1 text-enlace">· aprobada</span>
      </div>

      <button
        type="submit"
        disabled={paso !== null}
        className="btn-primario w-full sm:w-auto"
      >
        {paso && (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        )}
        {paso ? TEXTO_PASO[paso] : "Firmar y registrar"}
      </button>
      <p role="status" aria-live="polite" className="text-xs text-texto-2">
        {paso === "firmando"
          ? "Revisa la ventana de Freighter y aprueba la transacción."
          : "Freighter te pedirá firmar. El hash del expediente (incluido el checklist) quedará en el contrato de QRuta y ya no se podrá modificar."}
      </p>
    </form>
  );
}
