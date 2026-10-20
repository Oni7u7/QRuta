import Link from "next/link";
import { JetBrains_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Isotipo } from "@/components/marca/logo";
import { QrMarca } from "@/components/marca/qr-marca";
import { IconoEstado, type TonoEstado } from "@/components/marca/estado-unidad";
import { DIAS_POR_VENCER, TOTP_STEP } from "@/lib/config";

// Landing en estilo brutalista: esquinas a 0, bordes de 2 px en el color del texto, sombras duras sin
// desenfoque y monoespaciada para datos y etiquetas. Todo sale de los tokens de marca, así que funciona en
// ambos temas sin reglas aparte.
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"] });

const BORDE = "border-2 border-texto";
const SOMBRA = "shadow-[6px_6px_0_0_var(--tema-texto)]";
// Botón que se "hunde" al presionarlo: la sombra dura simula el grosor.
const BOTON_BASE = `inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap border-2 px-6 font-extrabold uppercase tracking-wide motion-safe:transition-[transform,box-shadow] motion-safe:duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none`;
const BOTON = `${BOTON_BASE} border-texto shadow-[4px_4px_0_0_var(--tema-texto)] hover:shadow-[6px_6px_0_0_var(--tema-texto)]`;
// Sobre un bloque del color del texto, borde y sombra van del color del fondo para que se sigan viendo.
const BOTON_INVERTIDO = `${BOTON_BASE} border-fondo shadow-[4px_4px_0_0_var(--tema-fondo)] hover:shadow-[6px_6px_0_0_var(--tema-fondo)]`;

const pasos = [
  {
    verbo: "Registra",
    quien: "El taller",
    texto:
      "Un taller verificado (KYB) captura el servicio, el kilometraje y un checklist de frenos, llantas, luces y más, y lo firma con su wallet de Freighter.",
  },
  {
    verbo: "Ancla",
    quien: "Stellar",
    texto:
      "Un contrato Soroban comprueba que la wallet del taller esté aprobada y guarda el hash del expediente. Nadie, ni QRuta, puede alterarlo sin que se note.",
  },
  {
    verbo: "Verifica",
    quien: "El pasajero",
    texto: "Escanea el QR de la pantalla de la unidad y ve al momento si el mantenimiento está vigente.",
  },
];

const estados: { tono: TonoEstado; titulo: string; texto: string; clase: string }[] = [
  { tono: "vigente", titulo: "Vigente", texto: "El último servicio sigue dentro de su periodo.", clase: "bg-vigente text-blanco" },
  {
    tono: "por-vencer",
    titulo: "Por vencer",
    texto: `Le quedan ${DIAS_POR_VENCER} días o menos para el siguiente servicio.`,
    clase: "bg-por-vencer text-grafito",
  },
  {
    tono: "vencido",
    titulo: "Vencido",
    texto: "El servicio venció, la unidad no tiene registro o el QR ya caducó.",
    clase: "bg-vencido text-blanco",
  },
];

// Seis elementos, seis celdas: 4+2 / 2+2+2 / 6 en escritorio.
const roadmap = [
  {
    titulo: "API pública de verificación",
    texto: "Endpoint documentado para que aseguradoras, inspectores y otros sistemas consulten el estado de una unidad.",
    clase: "md:col-span-4 bg-naranja text-grafito",
    grande: true,
  },
  {
    titulo: "Pantalla ESP32",
    texto: "Un microcontrolador en la unidad genera el QR consumiendo la API pública.",
    clase: "md:col-span-2 bg-superficie",
  },
  { titulo: "Multi-firma", texto: "Taller y operador firman juntos cada expediente.", clase: "md:col-span-2 bg-superficie" },
  {
    titulo: "Firma con huella",
    texto: "El taller firma con su huella o Face ID, sin extensión ni frase de recuperación (vía Accesly).",
    clase: "md:col-span-2 bg-texto text-fondo",
  },
  {
    titulo: "Pago contra expediente",
    texto: "El operador paga el servicio en USDC y el contrato lo libera al taller al registrarse el expediente.",
    clase: "md:col-span-2 bg-superficie",
  },
  {
    titulo: "Mainnet",
    texto: "Contrato y registros en la red principal de Stellar.",
    clase: "md:col-span-6 rayas",
    rayas: true,
  },
];

const ejemplo = [
  ["Unidad", "ABC123"],
  ["Servicio", "Preventivo"],
  ["Taller", "Taller Hernández"],
  ["Vence", "30 dic 2026"],
];

// Logos de Simple Icons (public/tecnologias); se pintan con el color del texto vía máscara.
const tecnologias = [
  { nombre: "Stellar", archivo: "stellar" },
  { nombre: "Supabase", archivo: "supabase" },
  { nombre: "Next.js", archivo: "nextdotjs" },
  { nombre: "Vercel", archivo: "vercel" },
];

const comparacion = [
  ["La bitácora es de papel: se pierde, se rehace o se llena después.", "El taller firma cada servicio y el expediente no se puede borrar."],
  ["Una calcomanía o una foto se copian y se pegan en cualquier unidad.", `El QR cambia cada ${TOTP_STEP} segundos y caduca.`],
  ["Hay que creerle al operador o al taller.", "La huella de cada expediente queda en Stellar; si alguien cambia los datos, se nota."],
  ["El pasajero no tiene cómo revisar antes de subir.", "Basta la cámara del celular, sin instalar nada."],
];

const preguntas = [
  {
    p: "¿Necesito instalar algo para verificar una unidad?",
    r: "No. Basta la cámara del celular: el QR abre la página de verificación en el navegador.",
  },
  {
    p: "¿Qué pasa si escaneo una foto del QR?",
    r: `El código caduca a los ${TOTP_STEP} segundos, así que la página muestra "Código expirado". Hay que escanear el que muestra en ese momento la pantalla de la unidad.`,
  },
  {
    p: "¿Quién puede registrar servicios?",
    r: "Solo talleres que QRuta revisó (KYB) y cuya wallet aprobó el contrato en Stellar. Si un taller se suspende, ya no puede registrar.",
  },
  {
    p: "¿Por qué Stellar?",
    r: "El contrato guarda la huella (hash) de cada expediente en una red pública. Si alguien cambia los datos, incluso QRuta, la huella deja de coincidir y la verificación lo marca. Registrar cuesta fracciones de centavo.",
  },
  {
    p: "¿Qué datos quedan públicos?",
    r: "Al escanear se ven el estado, el último servicio, el taller, la fecha de vencimiento y el checklist. En Stellar solo quedan la placa, la huella del expediente, la wallet del taller, el tipo de servicio y sus fechas.",
  },
  {
    p: "¿Ya funciona en la red principal?",
    r: "Todavía no. Este MVP opera en Stellar testnet: los registros son de demostración y no tienen validez legal. Pasar a mainnet está en el roadmap.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="overflow-x-clip">
        {/* Hero: titular a todo lo ancho, debajo el texto con las acciones y la calcomanía con el QR. */}
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:pt-14 md:pb-20">
          <p className={`${mono.className} inline-block ${BORDE} bg-naranja px-2 py-1 text-xs font-bold tracking-wider text-grafito uppercase`}>
            Mantenimiento verificable del transporte
          </p>
          <h1 className="mt-6 text-[2.6rem] leading-[0.95] font-extrabold tracking-tighter uppercase sm:text-6xl lg:text-[4.5rem]">
            Mantenimiento al día,
            <br className="hidden sm:block" /> <span className="text-oxido dark:text-naranja">verificado</span> al momento.
          </h1>

          <div className="mt-8 grid gap-12 md:grid-cols-12 md:items-end">
            <div className="md:col-span-6 lg:col-span-7">
              <p className={`max-w-[34ch] border-l-8 border-naranja pl-4 text-xl leading-snug font-semibold sm:text-2xl`}>
                Escanea el QR de la unidad y revisa su mantenimiento antes de subir.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link href="/verificar" className={`${BOTON} bg-naranja text-grafito`}>
                  Verificar unidad
                </Link>
                <Link href="/taller" className={`${BOTON} bg-fondo text-texto`}>
                  Registrar servicio
                </Link>
              </div>
            </div>

            {/* Calcomanía ilustrativa: el QR es el componente real de la pantalla de la unidad. */}
            <div className="md:col-span-6 md:justify-self-end lg:col-span-5" aria-hidden="true">
              <div className={`w-full max-w-[290px] ${BORDE} ${SOMBRA} bg-naranja p-5 text-grafito md:rotate-2`}>
                <div className="flex items-center justify-between gap-3 border-b-2 border-grafito pb-3">
                  <Isotipo variant="sobreNaranja" alto={34} />
                  <span className={`${mono.className} text-right text-xs leading-tight font-bold uppercase`}>
                    Unidad
                    <br />
                    verificable
                  </span>
                </div>
                <div className="mt-4 border-2 border-grafito bg-blanco p-2">
                  <QrMarca valor="https://qruta.vercel.app" titulo="" className="block w-full" />
                </div>
                <p className={`${mono.className} mt-3 flex items-center justify-between text-xs font-bold uppercase`}>
                  <span>Escanea la pantalla</span>
                  <span className="bg-grafito px-1.5 py-0.5 text-naranja">15 s</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Tecnologías sobre las que corre QRuta. */}
        <section aria-label="Tecnologías" className="border-t-2 border-texto">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:grid-cols-4">
            {tecnologias.map((t) => (
              <li key={t.archivo} className="flex items-center justify-center gap-3 py-6">
                <span
                  role="img"
                  aria-label={t.nombre}
                  className="size-7 shrink-0 bg-texto"
                  style={{
                    mask: `url(/tecnologias/${t.archivo}.svg) center / contain no-repeat`,
                    WebkitMask: `url(/tecnologias/${t.archivo}.svg) center / contain no-repeat`,
                  }}
                />
                <span aria-hidden="true" className="text-lg font-extrabold uppercase">
                  {t.nombre}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* El dato que hace distinto al producto, a todo lo ancho. */}
        <section className="border-y-2 border-texto bg-naranja text-grafito">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-12 md:items-center md:py-16">
            <p className="text-[7rem] leading-[0.8] font-extrabold tracking-tighter md:col-span-5 md:text-[10rem]">
              15<span className="text-[0.45em]">s</span>
            </p>
            <div className="md:col-span-7">
              <h2 className="text-3xl leading-tight font-extrabold uppercase sm:text-4xl">Una foto del QR no sirve.</h2>
              <p className="mt-3 max-w-[50ch] text-lg font-semibold">
                El código de la pantalla cambia cada 15 segundos y caduca. Solo quien está frente a la unidad puede verificarla.
              </p>
            </div>
          </div>
        </section>

        {/* Cómo funciona: filas con el verbo como título. */}
        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 md:py-24">
          <h2 className="max-w-[18ch] text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
            Tres pasos, sin apps que instalar.
          </h2>
          <ol className="mt-12 border-b-2 border-texto">
            {pasos.map((p) => (
              <li key={p.verbo} className="grid gap-3 border-t-2 border-texto py-8 md:grid-cols-12 md:gap-8">
                <div className="md:col-span-5">
                  <h3 className="text-4xl leading-none font-extrabold tracking-tighter uppercase sm:text-5xl">{p.verbo}</h3>
                  <p className={`${mono.className} mt-3 text-sm font-bold text-oxido uppercase dark:text-naranja`}>{p.quien}</p>
                </div>
                <p className="max-w-[60ch] text-lg md:col-span-7 md:pt-1">{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Hoy contra QRuta: dos columnas que se leen fila por fila. */}
        <section className="mx-auto max-w-6xl px-4 pb-16 md:pb-24">
          <h2 className="max-w-[20ch] text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
            Lo que cambia con QRuta.
          </h2>
          <div className={`mt-12 grid ${BORDE} ${SOMBRA} md:grid-cols-2`}>
            <div className="bg-superficie">
              <p className="flex items-center gap-3 border-b-2 border-texto px-6 py-4 text-2xl font-extrabold uppercase">
                <IconoEstado tono="vencido" className="size-7 text-vencido dark:text-texto" />
                Hoy
              </p>
              <ul className="px-6">
                {comparacion.map(([hoy]) => (
                  <li key={hoy} className="border-b border-dashed border-borde py-5 text-lg last:border-0 md:min-h-24">
                    {hoy}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t-2 border-texto bg-naranja text-grafito md:border-t-0 md:border-l-2">
              <p className="flex items-center gap-3 border-b-2 border-texto px-6 py-4 text-2xl font-extrabold uppercase">
                <IconoEstado tono="vigente" className="size-7" />
                Con QRuta
              </p>
              <ul className="px-6">
                {comparacion.map(([, con]) => (
                  <li key={con} className="border-b border-dashed border-grafito/50 py-5 text-lg font-semibold last:border-0 md:min-h-24">
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Qué ve el pasajero: un ejemplo de resultado y los tres estados posibles. */}
        <section className="mx-auto max-w-6xl px-4 pb-16 md:pb-24">
          <h2 className="text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">Así se ve al escanear.</h2>
          <div className="mt-12 grid gap-10 md:grid-cols-12 md:items-start">
            <figure className={`md:col-span-5 ${BORDE} ${SOMBRA} bg-superficie`} aria-label="Ejemplo de resultado">
              <div className="flex items-center gap-3 border-b-2 border-texto bg-vigente px-5 py-4 text-blanco">
                <IconoEstado tono="vigente" className="size-7" />
                <span className="text-2xl font-extrabold uppercase">Unidad vigente</span>
              </div>
              <dl className={`${mono.className} px-5 py-2 text-sm`}>
                {ejemplo.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-dashed border-borde py-3 last:border-0">
                    <dt className="uppercase">{k}</dt>
                    <dd className="text-right font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
              <figcaption className={`${mono.className} border-t-2 border-texto px-5 py-2 text-xs uppercase`}>
                Ejemplo ilustrativo
              </figcaption>
            </figure>

            <ul className="grid gap-4 md:col-span-7">
              {estados.map((e) => (
                <li key={e.tono} className={`flex items-start gap-4 ${BORDE} p-5 ${e.clase}`}>
                  <IconoEstado tono={e.tono} className="mt-0.5 size-8 shrink-0" />
                  <div>
                    <p className="text-2xl leading-none font-extrabold uppercase">{e.titulo}</p>
                    <p className="mt-2 font-semibold">{e.texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Roadmap en mosaico. */}
        <section id="roadmap" className="scroll-mt-16 border-t-2 border-texto">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
            <p className={`${mono.className} text-sm font-bold uppercase`}>Roadmap</p>
            <h2 className="mt-3 max-w-[20ch] text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
              Lo que viene después de este MVP.
            </h2>
            <ul className="mt-12 grid gap-4 md:grid-cols-6">
              {roadmap.map((r) => (
                <li key={r.titulo} className={`${BORDE} p-6 ${r.clase} ${r.grande ? "md:min-h-56" : ""}`}>
                  <div className={r.rayas ? `inline-block max-w-xl ${BORDE} bg-fondo p-4` : ""}>
                    <h3 className={`font-extrabold uppercase ${r.grande ? "text-3xl sm:text-4xl" : "text-xl"}`}>{r.titulo}</h3>
                    <p className={`mt-2 ${r.grande ? "max-w-[44ch] text-lg font-semibold" : ""}`}>{r.texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Preguntas frecuentes en acordeón (details/summary nativo, funciona sin JavaScript). */}
        <section id="preguntas" className="scroll-mt-16 border-t-2 border-texto">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
            <h2 className="text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">Preguntas frecuentes.</h2>
            <div className="mt-12 grid gap-4 md:grid-cols-2 md:items-start">
              {preguntas.map((q) => (
                <details key={q.p} className={`group ${BORDE} bg-superficie open:shadow-[6px_6px_0_0_var(--tema-texto)]`}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5 text-lg font-extrabold [&::-webkit-details-marker]:hidden">
                    {q.p}
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center border-2 border-texto text-xl leading-none motion-safe:transition-transform group-open:rotate-45 group-open:bg-naranja group-open:text-grafito"
                    >
                      +
                    </span>
                  </summary>
                  <p className="border-t-2 border-texto p-5">{q.r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Para quién es: concesionarios y talleres, cada uno con su acción. */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <h2 className="text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">Para quién es.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-12">
            <div className={`flex flex-col ${BORDE} bg-texto p-6 text-fondo sm:p-10 md:col-span-7`}>
              <h3 className="text-3xl font-extrabold uppercase sm:text-4xl">Concesionarios y rutas</h3>
              <p className="mt-4 max-w-[46ch] flex-1 text-lg">
                Muestra en cada unidad un QR que prueba que su mantenimiento está al día. Lleva tus unidades a un taller dado de alta
                en QRuta y abre su pantalla con la placa.
              </p>
              <div className="mt-8">
                <Link href="/pantalla" className={`${BOTON_INVERTIDO} bg-naranja text-grafito`}>
                  Abrir pantalla
                </Link>
              </div>
            </div>
            <div className={`flex flex-col ${BORDE} ${SOMBRA} bg-naranja p-6 text-grafito sm:p-10 md:col-span-5`}>
              <h3 className="text-3xl font-extrabold uppercase sm:text-4xl">Talleres</h3>
              <p className="mt-4 max-w-[40ch] flex-1 text-lg font-semibold">
                Cada servicio que haces queda firmado con tu wallet y a tu nombre. Pide tu alta: revisamos tu negocio y aprobamos tu
                wallet.
              </p>
              <div className="mt-8">
                <Link href="/registro-taller" className={`${BOTON} bg-grafito text-naranja`}>
                  Solicitar alta
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
