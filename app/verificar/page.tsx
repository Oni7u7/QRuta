import type { Metadata } from "next";
import { ChecklistView, IntegridadBadge, tieneFallas } from "@/components/checklist-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TIPO_LABEL } from "@/lib/config";
import { verificar, type Estado, type Verificacion } from "@/lib/verificar";

export const metadata: Metadata = {
  title: "Verificar unidad · QRuta",
  robots: { index: false },
};

const ESTADOS: Record<Estado, { titulo: string; texto: string; ok: boolean }> = {
  VIGENTE: { titulo: "Vigente", texto: "El mantenimiento de esta unidad está al día.", ok: true },
  VENCIDO: { titulo: "Vencido", texto: "El último mantenimiento de esta unidad ya superó su vigencia.", ok: false },
  EXPIRADO: {
    titulo: "Código expirado",
    texto: "Este QR ya no es válido. Escanea el código que muestra ahora la pantalla de la unidad; una foto o captura no sirve.",
    ok: false,
  },
  SIN_MANTENIMIENTO: {
    titulo: "Sin mantenimiento",
    texto: "La unidad está registrada pero no tiene servicios de mantenimiento.",
    ok: false,
  },
  NO_REGISTRADA: { titulo: "Unidad no registrada", texto: "Esta placa no tiene expedientes en QRuta.", ok: false },
};

function primero(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function diasRestantes(iso: string) {
  const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (dias > 1) return `quedan ${dias} días`;
  if (dias === 1) return "queda 1 día";
  if (dias >= 0) return "vence hoy";
  return dias === -1 ? "venció hace 1 día" : `venció hace ${-dias} días`;
}

export default async function VerificarPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[]; t?: string | string[] }>;
}) {
  const params = await searchParams;
  const placa = primero(params.p).slice(0, 32);
  const token = primero(params.t).slice(0, 12);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
        {placa ? <Resultado v={await verificar(placa, token)} /> : <SinParametros />}
      </main>
      <SiteFooter />
    </>
  );
}

function Resultado({ v }: { v: Verificacion }) {
  const e = ESTADOS[v.estado];
  return (
    <>
      <h1 className="sr-only">Resultado de la verificación</h1>
      <section
        aria-live="polite"
        className={`rounded-2xl p-6 sm:p-8 ${
          e.ok ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-zinc-950" : "bg-red-600 text-white dark:bg-red-500 dark:text-zinc-950"
        }`}
      >
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-7">
              {e.ok ? (
                <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
              )}
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium opacity-85">
              Unidad <span className="font-mono tracking-wider">{v.placa}</span>
            </p>
            <p className="mt-0.5 text-3xl font-semibold tracking-tight sm:text-4xl">{e.titulo}</p>
            <p className="mt-2 opacity-90">{e.texto}</p>
          </div>
        </div>
      </section>

      {(v.estado === "VIGENTE" || v.estado === "VENCIDO") && (
        <section className="mt-6" aria-labelledby="detalle">
          <IntegridadBadge {...v.integridad} />

          {v.checklist && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold">Componentes revisados</h2>
              <div className="mt-2">
                <ChecklistView checklist={v.checklist} />
              </div>
              {tieneFallas(v.checklist) && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  El taller reportó fallas en este servicio.
                </p>
              )}
            </div>
          )}

          <h2 id="detalle" className="mt-6 text-sm font-semibold">
            Detalle del último servicio
          </h2>
          <dl className="mt-2 divide-y divide-zinc-200 rounded-xl border border-zinc-200 px-4 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            <Fila k="Placa" v={<span className="font-mono">{v.placa}</span>} />
            <Fila k="Servicio" v={TIPO_LABEL[v.tipo]} />
            <Fila k="Fecha del servicio" v={formatFecha(v.fecha)} />
            <Fila
              k="Vigente hasta"
              v={
                <>
                  {formatFecha(v.vigente_hasta)}
                  <span
                    className={`block text-xs font-normal ${
                      v.estado === "VIGENTE" ? "text-teal-700 dark:text-teal-400" : "text-red-700 dark:text-red-400"
                    }`}
                  >
                    {diasRestantes(v.vigente_hasta)}
                  </span>
                </>
              }
            />
            <Fila
              k="Firmado por"
              v={
                <>
                  {v.firmado_por}
                  <span
                    className={`block text-xs font-normal ${
                      v.taller_verificado ? "text-teal-700 dark:text-teal-400" : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {v.taller_verificado ? "Taller verificado (KYB)" : "Registro previo al KYB"}
                  </span>
                </>
              }
            />
            <div className="py-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Hash SHA-256 del expediente</dt>
              <dd className="mt-1 font-mono text-xs break-all">{v.hash}</dd>
            </div>
          </dl>

          <a
            href={v.stellar_expert}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Ver transacción en Stellar Expert
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">(abre en otra pestaña)</span>
          </a>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            El hash está publicado en el memo de la transacción en Stellar testnet. Si el expediente se alterara, el hash ya no
            coincidiría.
          </p>
        </section>
      )}
    </>
  );
}

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

function SinParametros() {
  return (
    <div className="text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
          <path
            d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Verificar una unidad</h1>
      <p className="mx-auto mt-3 max-w-sm text-zinc-600 dark:text-zinc-400">
        Escanea con la cámara de tu celular el QR que muestra la pantalla de la unidad. Verás aquí si su mantenimiento está
        vigente.
      </p>
      <ol className="mx-auto mt-8 max-w-sm space-y-3 text-left text-sm">
        {[
          "Busca la pantalla de QRuta dentro de la unidad.",
          "Escanea el QR en vivo: cambia cada 15 segundos.",
          "Revisa el estado y, si quieres, la transacción en Stellar.",
        ].map((paso, i) => (
          <li key={paso} className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold dark:bg-zinc-800">
              {i + 1}
            </span>
            <span className="text-zinc-700 dark:text-zinc-300">{paso}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
