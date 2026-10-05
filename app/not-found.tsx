import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-24 text-center">
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Página no encontrada</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">La dirección que abriste no existe en QRuta.</p>
        <Link href="/" className="mt-6 inline-block font-medium text-teal-700 hover:underline dark:text-teal-400">
          Volver al inicio
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
