import Link from "next/link";
import { Logo } from "./marca/logo";

const enlaces = [
  { href: "/verificar", label: "Verificar unidad" },
  { href: "/taller", label: "Registrar servicio" },
  { href: "/registro-taller", label: "Solicitar alta" },
  { href: "/pantalla", label: "Pantalla de la unidad" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#preguntas", label: "Preguntas frecuentes" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-linea">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          {/* Positivo en tema claro, negativo en oscuro. */}
          <span className="block dark:hidden">
            <Logo variant="positivo" alto={30} />
          </span>
          <span className="hidden dark:block">
            <Logo variant="negativo" alto={30} />
          </span>
          <p className="mt-3 max-w-[32ch] text-[15px] text-texto-2">Mantenimiento al día, verificado al momento.</p>
        </div>
        <nav aria-label="Pie de página">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-3 text-[15px] font-semibold">
            {enlaces.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className="hover:text-enlace">
                  {e.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-linea">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-5 text-sm text-texto-2 sm:flex-row sm:items-center sm:justify-between">
          <p>QRuta · MVP fase 1</p>
          <p className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-naranja" aria-hidden="true" />
            Opera en Stellar testnet: los registros son de demostración y no tienen validez legal.
          </p>
        </div>
      </div>
    </footer>
  );
}
