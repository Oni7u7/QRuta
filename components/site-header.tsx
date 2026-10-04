import Link from "next/link";
import { Logo } from "./logo";

const links = [
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#roadmap", label: "Roadmap" },
  { href: "/verificar", label: "Verificar" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4" aria-label="Principal">
        <Logo />
        <ul className="flex items-center gap-4 text-sm text-zinc-600 sm:gap-6 dark:text-zinc-400">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="hover:text-zinc-900 dark:hover:text-zinc-100">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
