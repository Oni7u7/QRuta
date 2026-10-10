import type { Metadata } from "next";
import Link from "next/link";
import { ChecklistView, IntegridadBadge, tieneFallas } from "@/components/checklist-view";
import { formatFecha, inputClass } from "@/components/ui";
import { TIPO_LABEL } from "@/lib/config";
import { getTaller } from "@/lib/auth";
import { historialPlaca } from "@/lib/historial";
import { normalizePlaca } from "@/lib/placa";

export const metadata: Metadata = {
  title: "Historial de unidad · QRuta",
};

export default async function UnidadPage({ searchParams }: { searchParams: Promise<{ p?: string | string[] }> }) {
  // El historial (notas y fallas) es privado: solo para talleres aprobados.
  if ((await getTaller())?.estado !== "aprobado") return null;
  const { p } = await searchParams;
  const placa = normalizePlaca(typeof p === "string" ? p.slice(0, 32) : "");
  const valida = placa.length >= 3 && placa.length <= 10;
  const historial = valida ? await historialPlaca(placa) : null;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Buscar unidad</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Consulta el historial completo de una placa, incluidas las notas y fallas reportadas por otros talleres.
      </p>

      <form action="/taller/unidad" className="mt-6 flex gap-2" role="search">
        <label htmlFor="p" className="sr-only">
          Placa
        </label>
        <input
          id="p"
          name="p"
          required
          minLength={3}
          maxLength={12}
          defaultValue={placa}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ABC-123"
          className={`${inputClass} mt-0 uppercase`}
        />
        <button
          type="submit"
          className="h-11 shrink-0 self-end rounded-lg bg-teal-600 px-4 font-medium text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
        >
          Buscar
        </button>
      </form>

      {p !== undefined && !valida && (
        <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-400">
          Escribe una placa válida (de 3 a 10 letras o números).
        </p>
      )}

      {historial && !historial.registrada && (
        <p role="status" className="mt-8 rounded-xl border border-zinc-200 p-5 text-sm dark:border-zinc-800">
          La placa <span className="font-mono font-medium">{placa}</span> no tiene expedientes en QRuta.{" "}
          <Link href="/taller" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Registrar su primer servicio
          </Link>
        </p>
      )}

      {historial?.registrada && (
        <section className="mt-10" aria-labelledby="historial">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="historial" className="text-lg font-semibold">
              Historial de <span className="font-mono tracking-wider">{placa}</span>
            </h2>
            <Link href={`/pantalla?p=${placa}`} className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400">
              Abrir pantalla de la unidad
            </Link>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {historial.expedientes.length} {historial.expedientes.length === 1 ? "servicio" : "servicios"}, del más reciente al más
            antiguo.
          </p>

          <ol className="mt-6 space-y-4">
            {historial.expedientes.map((e) => {
              const vigente = new Date(e.vigente_hasta).getTime() >= Date.now();
              return (
                <li key={e.id} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {TIPO_LABEL[e.tipo]} · {formatFecha(e.fecha, "long")}
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {e.firmado_por}
                        {e.taller_verificado ? " · taller verificado" : " · registro previo al KYB"}
                        {e.kilometraje != null && ` · ${e.kilometraje.toLocaleString("es-MX")} km`}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        vigente
                          ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {vigente ? `Vigente hasta ${formatFecha(e.vigente_hasta)}` : `Venció ${formatFecha(e.vigente_hasta)}`}
                    </span>
                  </div>

                  {e.checklist ? (
                    <div className="mt-4">
                      <ChecklistView checklist={e.checklist} />
                      {tieneFallas(e.checklist) && (
                        <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-400">Se reportaron fallas en este servicio.</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Registro anterior al checklist.</p>
                  )}

                  {e.notas && (
                    <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Notas del taller</p>
                      <p className="mt-1 whitespace-pre-line">{e.notas}</p>
                    </div>
                  )}

                  <div className="mt-4">
                    <IntegridadBadge {...e.integridad} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono break-all text-zinc-500 dark:text-zinc-400">{e.hash}</span>
                    <a
                      href={e.stellar_expert}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      Ver en Stellar Expert<span className="sr-only"> (abre en otra pestaña)</span>
                    </a>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}
