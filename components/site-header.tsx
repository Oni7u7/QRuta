import Link from "next/link";
import { Logo } from "./marca/logo";
import { MenuMovil } from "./menu-movil";
import { SelectorTema } from "./tema/selector-tema";

const links = [
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#roadmap", label: "Roadmap" },
  { href: "/verificar", label: "Verificar" },
  { href: "/taller", label: "Talleres" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-linea bg-superficie">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4" aria-label="Principal">
        <Link href="/" aria-label="QRuta, inicio" className="-ml-[6px] rounded-lg">
          {/* Positivo en tema claro, negativo en oscuro (el área de respeto la da el propio logo). */}
          <span className="block dark:hidden">
            <Logo variant="positivo" alto={30} />
          </span>
          <span className="hidden dark:block">
            <Logo variant="negativo" alto={30} />
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Escritorio: todos los enlaces en una línea. */}
          <ul className="hidden items-center gap-6 text-[15px] font-semibold text-texto md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-enlace">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* Móvil: la acción principal a la vista y el resto en el menú. */}
          <Link href="/verificar" className="mr-1 text-[15px] font-semibold text-texto hover:text-enlace md:hidden">
            Verificar
          </Link>
          <SelectorTema />
          <div className="md:hidden">
            <MenuMovil links={links} />
          </div>
        </div>
      </nav>
    </header>
  );
}
