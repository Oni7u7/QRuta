import type { Metadata } from "next";
import { ChecklistView, IntegridadBadge, tieneFallas } from "@/components/checklist-view";
import { SiteFooter } from "@/components/site-footer";
import { abreviar } from "@/components/ui";
import { SiteHeader } from "@/components/site-header";
import { EstadoUnidad, IconoEstado, type TonoEstado } from "@/components/marca/estado-unidad";
import { DIAS_POR_VENCER, TIPO_LABEL } from "@/lib/config";
import { verificar, type Verificacion } from "@/lib/verificar";

export const metadata: Metadata = {
  title: "Verificar unidad · QRuta",
  robots: { index: false },
};

// Cómo se presenta cada estado con los tres colores del manual (siempre icono + palabra).
function presentacion(v: Verificacion): { tono: TonoEstado; titulo: string; texto: string } {
  switch (v.estado) {
    case "VIGENTE":
      return diasRestantesNum(v.vigente_hasta) <= DIAS_POR_VENCER
        ? { tono: "por-vencer", titulo: "Unidad por vencer", texto: "El mantenimiento está vigente, pero vence pronto." }
        : { tono: "vigente", titulo: "Unidad vigente", texto: "El mantenimiento de esta unidad está al día." };
    case "VENCIDO":
      return { tono: "vencido", titulo: "Unidad vencida", texto: "El último mantenimiento de esta unidad ya superó su vigencia." };
    case "EXPIRADO":
      return {
        tono: "vencido",
        titulo: "Código expirado",
        texto: "Este QR ya no es válido. Escanea el código que muestra ahora la pantalla de la unidad; una foto o captura no sirve.",
      };
    case "SIN_MANTENIMIENTO":
      return { tono: "vencido", titulo: "Sin mantenimiento", texto: "La unidad está registrada pero no tiene servicios de mantenimiento." };
    case "NO_REGISTRADA":
      return { tono: "vencido", titulo: "Unidad no registrada", texto: "Esta placa no tiene expedientes en QRuta." };
  }
}

function primero(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function diasRestantesNum(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function diasRestantes(iso: string) {
  const dias = diasRestantesNum(iso);
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
      <div className="bg-resultado">
        <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
          {placa ? <Resultado v={await verificar(placa, token)} /> : <SinParametros />}
        </main>
      </div>
      <SiteFooter />
    </>
  );
}

function Resultado({ v }: { v: Verificacion }) {
  const e = presentacion(v);
  return (
    <>
      <h1 className="sr-only">Resultado de la verificación</h1>
      <EstadoUnidad
        tono={e.tono}
        titulo={e.titulo}
        antes={
          <p className="text-sm font-semibold">
            Unidad <span className="tracking-wider">{v.placa}</span>
          </p>
        }
      >
        <p>{e.texto}</p>
      </EstadoUnidad>

      {(v.estado === "VIGENTE" || v.estado === "VENCIDO") && (
        <section className="mt-6" aria-labelledby="detalle">
          <IntegridadBadge {...v.integridad} />

          {v.checklist && (
            <div className="mt-6">
              <h2 className="etiqueta text-texto-2">Componentes revisados</h2>
              <div className="mt-2">
                <ChecklistView checklist={v.checklist} />
              </div>
              {tieneFallas(v.checklist) && (
                <p className="mt-2 flex items-center gap-2 rounded-lg bg-por-vencer px-3 py-2 text-sm font-semibold text-grafito">
                  <IconoEstado tono="por-vencer" className="size-4" />
                  El taller reportó fallas en este servicio.
                </p>
              )}
            </div>
          )}

          <h2 id="detalle" className="etiqueta mt-6 text-texto-2">
            Detalle del último servicio
          </h2>
          <dl className="tarjeta mt-2 divide-y divide-linea px-4 text-[15px]">
            <Fila k="Unidad" v={v.placa} />
            <Fila k="Último servicio" v={`${TIPO_LABEL[v.tipo]} · ${formatFecha(v.fecha)}`} />
            <Fila
              k="Taller"
              v={
                <>
                  {v.firmado_por}
                  <span className={`block text-xs font-normal ${v.firma === "previo" ? "text-texto-2" : "text-texto-vigente"}`}>
                    {FIRMA_TEXTO[v.firma]}
                  </span>
                </>
              }
            />
            <Fila
              k="Vence"
              v={
                <>
                  {formatFecha(v.vigente_hasta)}
                  <span
                    className={`block text-xs font-normal ${
                      v.estado === "VIGENTE" ? "text-texto-vigente" : "text-texto-vencido"
                    }`}
                  >
                    {diasRestantes(v.vigente_hasta)}
                  </span>
                </>
              }
            />
            {v.firmado_con && (
              <Fila
                k="Wallet que firmó"
                v={
                  <span title={v.firmado_con}>
                    {abreviar(v.firmado_con)}
                  </span>
                }
              />
            )}
            <div className="py-3">
              <dt className="text-texto-2">Huella SHA-256 del expediente</dt>
              <dd className="mt-1 text-xs break-all tabular-nums">{v.hash}</dd>
            </div>
          </dl>

          <a
            href={v.stellar_expert}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secundario mt-4 w-full"
          >
            Ver transacción en Stellar Expert
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">(abre en otra pestaña)</span>
          </a>
          {v.contrato && (
            <a
              href={v.contrato}
              target="_blank"
              rel="noopener noreferrer"
              className="enlace mt-3 block text-center text-sm"
            >
              Ver el contrato de QRuta en Stellar Expert<span className="sr-only"> (abre en otra pestaña)</span>
            </a>
          )}
          <p className="mt-3 text-xs text-texto-2">
            {v.firma === "contrato"
              ? "El taller firmó este expediente con su wallet y el contrato de QRuta en Stellar testnet guarda su hash. Si el expediente se alterara, el hash ya no coincidiría."
              : "El hash está publicado en el memo de la transacción en Stellar testnet. Si el expediente se alterara, el hash ya no coincidiría."}
          </p>
        </section>
      )}
    </>
  );
}

const FIRMA_TEXTO = {
  contrato: "Firmado con su wallet · aprobada en el contrato",
  kyb: "Taller verificado (KYB)",
  previo: "Registro previo al KYB",
} as const;

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="shrink-0 text-texto-2">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}

function SinParametros() {
  return (
    <div className="text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-naranja text-grafito">
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
      <h1 className="titulo mt-5">Verificar una unidad</h1>
      <p className="mx-auto mt-3 max-w-sm">
        Escanea con la cámara de tu celular el QR que muestra la pantalla de la unidad. Verás aquí si su mantenimiento está
        vigente.
      </p>
      <ol className="mx-auto mt-8 max-w-sm space-y-3 text-left text-sm">
        {[
          "Busca la pantalla de QRuta dentro de la unidad.",
          "Escanea el QR en vivo: cambia cada 15 segundos.",
          "Revisa el estado y, si quieres, la transacción en Stellar.",
        ].map((paso, i) => (
          <li key={paso} className="tarjeta flex gap-3 p-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-naranja text-xs font-semibold text-grafito">
              {i + 1}
            </span>
            <span className="text-texto">{paso}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
