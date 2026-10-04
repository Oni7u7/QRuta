import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const pasos = [
  {
    n: "1",
    titulo: "Registro",
    texto:
      "El taller captura placa, tipo de servicio, fecha y notas, y firma con su nombre. QRuta calcula el hash SHA-256 del expediente.",
  },
  {
    n: "2",
    titulo: "Anclaje en Stellar",
    texto:
      "El hash se publica en el memo de una transacción de Stellar. Desde ese momento nadie puede alterar el expediente sin que se note.",
  },
  {
    n: "3",
    titulo: "Verificación con QR",
    texto:
      "La pantalla de la unidad muestra un QR que cambia cada 15 s. Al escanearlo ves si el mantenimiento está vigente; una foto vieja no sirve.",
  },
];

const roadmap = [
  {
    titulo: "API pública de verificación",
    texto: "Endpoint documentado para que aseguradoras, inspectores y otros sistemas consulten el estado de una unidad.",
  },
  { titulo: "Pantalla ESP32", texto: "Un microcontrolador en la unidad genera el QR consumiendo la API pública." },
  { titulo: "Multi-firma", texto: "Taller y operador firman juntos cada expediente." },
  { titulo: "Login por taller", texto: "Cuentas propias para cada taller autorizado." },
  { titulo: "Soroban", texto: "Registro de talleres y expedientes en un contrato inteligente." },
  { titulo: "Mainnet", texto: "Anclaje en la red principal de Stellar." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-5xl gap-12 px-4 py-16 sm:py-24 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <span className="size-1.5 rounded-full bg-teal-500" aria-hidden="true" />
              Infraestructura de confianza para el transporte
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              El mantenimiento de tu unidad, verificable por cualquiera
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
              Los talleres registran cada servicio, QRuta lo ancla en Stellar y la unidad muestra un QR dinámico. Pasajeros,
              inspectores y aseguradoras lo comprueban en segundos.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/taller"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-600 px-5 font-medium text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
              >
                Registrar servicio
              </Link>
              <Link
                href="/verificar"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Verificar una unidad
              </Link>
            </div>
          </div>

          {/* Vista previa de la tarjeta de verificación */}
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800" aria-hidden="true">
            <div className="rounded-xl bg-teal-600 p-5 text-white dark:bg-teal-500 dark:text-zinc-950">
              <p className="text-xs font-medium tracking-wide uppercase opacity-80">Estado</p>
              <p className="mt-1 text-3xl font-semibold">Vigente</p>
              <p className="mt-1 text-sm opacity-90">Mantenimiento al día</p>
            </div>
            <dl className="mt-4 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {[
                ["Placa", "ABC123"],
                ["Servicio", "Preventivo"],
                ["Vigente hasta", "30 dic 2026"],
                ["Firmado por", "Taller Hernández"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2">
                  <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">Ejemplo ilustrativo</p>
          </div>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" className="scroll-mt-16 border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cómo funciona</h2>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">Tres pasos, sin hardware especial ni apps que instalar.</p>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {pasos.map((p) => (
                <li key={p.n} className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
                  <span className="flex size-8 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                    {p.n}
                  </span>
                  <h3 className="mt-4 font-semibold">{p.titulo}</h3>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Roadmap */}
        <section id="roadmap" className="scroll-mt-16 border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Roadmap</h2>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">Lo que viene después de este MVP.</p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roadmap.map((r) => (
                <li key={r.titulo} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
                  <h3 className="font-semibold">{r.titulo}</h3>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{r.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
