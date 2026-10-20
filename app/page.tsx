import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { Calcomania } from "@/components/marca/calcomania";
import { EstadoBadge } from "@/components/marca/estado-unidad";
import { SiteHeader } from "@/components/site-header";

const pasos = [
  {
    n: "1",
    titulo: "Registro",
    texto:
      "Un taller verificado (KYB) inicia sesión, captura el servicio, el kilometraje y un checklist de frenos, llantas, luces y más, y lo firma con su wallet de Freighter.",
  },
  {
    n: "2",
    titulo: "Contrato en Stellar",
    texto:
      "Un contrato inteligente (Soroban) comprueba que la wallet del taller esté aprobada y guarda el hash del expediente. Desde ese momento nadie, ni QRuta, puede alterarlo sin que se note.",
  },
  {
    n: "3",
    titulo: "Verificación con QR",
    texto:
      "La pantalla de la unidad muestra un QR que cambia cada 15 segundos. Al escanearlo ves si el mantenimiento está vigente; una foto vieja no sirve.",
  },
];

const roadmap = [
  {
    titulo: "API pública de verificación",
    texto: "Endpoint documentado para que aseguradoras, inspectores y otros sistemas consulten el estado de una unidad.",
  },
  { titulo: "Pantalla ESP32", texto: "Un microcontrolador en la unidad genera el QR consumiendo la API pública." },
  { titulo: "Multi-firma", texto: "Taller y operador firman juntos cada expediente." },
  {
    titulo: "Firma con huella",
    texto: "El taller firma con su huella o Face ID, sin extensión ni frase de recuperación (vía Accesly).",
  },
  { titulo: "Pago contra expediente", texto: "El operador paga el servicio en USDC y el contrato lo libera al taller al registrarse el expediente." },
  { titulo: "Mainnet", texto: "Contrato y registros en la red principal de Stellar." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-5xl gap-12 px-4 py-14 sm:py-20 md:grid-cols-[1.25fr_1fr] md:items-center">
          <div>
            <p className="etiqueta text-texto-2">Mantenimiento verificable del transporte</p>
            <h1 className="titulo mt-3">Mantenimiento al día, verificado al momento.</h1>
            <p className="subtitulo mt-4">Escanea el QR y revisa la unidad antes de subir.</p>
            <p className="mt-4 max-w-xl">
              Cada servicio queda registrado por un taller autorizado en un expediente que nadie puede borrar. El QR cambia cada
              15 segundos, así que una foto deja de servir.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/verificar" className="btn-primario">
                Verificar una unidad
              </Link>
              <Link href="/taller" className="btn-secundario">
                Registrar servicio
              </Link>
            </div>
            <p className="mt-4 text-[15px]">
              ¿Tienes un taller?{" "}
              <Link href="/registro-taller" className="enlace">
                Solicita tu alta en QRuta
              </Link>
            </p>
          </div>

          {/* Calcomanía de la unidad y ejemplo de resultado (ilustrativos) */}
          <div className="mx-auto grid w-full max-w-sm gap-4" aria-hidden="true">
            <Calcomania />
            <div className="tarjeta p-5">
              <EstadoBadge tono="vigente">Unidad vigente</EstadoBadge>
              <dl className="mt-3 divide-y divide-linea text-[15px]">
                {[
                  ["Unidad", "ABC123"],
                  ["Último servicio", "Preventivo"],
                  ["Taller", "Taller Hernández"],
                  ["Vence", "30 dic 2026"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2">
                    <dt className="text-texto-2">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-center text-xs text-texto-2">Ejemplo ilustrativo</p>
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" className="scroll-mt-16 border-t border-linea">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <p className="etiqueta text-texto-2">Cómo funciona</p>
            <h2 className="subtitulo mt-2">Tres pasos, sin apps que instalar</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {pasos.map((p) => (
                <li key={p.n} className="tarjeta p-6">
                  <span className="flex size-8 items-center justify-center rounded-full bg-naranja text-sm font-semibold text-grafito">
                    {p.n}
                  </span>
                  <h3 className="mt-4 font-semibold">{p.titulo}</h3>
                  <p className="mt-2 text-[15px] text-texto-2">{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Roadmap */}
        <section id="roadmap" className="scroll-mt-16 border-t border-linea">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <p className="etiqueta text-texto-2">Roadmap</p>
            <h2 className="subtitulo mt-2">Lo que viene después de este MVP</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roadmap.map((r) => (
                <li key={r.titulo} className="tarjeta p-5">
                  <h3 className="font-semibold">{r.titulo}</h3>
                  <p className="mt-2 text-[15px] text-texto-2">{r.texto}</p>
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
