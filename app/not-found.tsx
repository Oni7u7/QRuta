import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-24 text-center">
        <p className="font-mono text-sm text-texto-2">404</p>
        <h1 className="titulo mt-2">Página no encontrada</h1>
        <p className="mt-3 text-texto-2">La dirección que abriste no existe en QRuta.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-enlace hover:underline">
          Volver al inicio
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
