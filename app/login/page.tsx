import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Iniciar sesión · QRuta",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-sm px-4 py-12 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="mt-2 mb-8 text-zinc-600 dark:text-zinc-400">
          Para talleres verificados y administradores de QRuta.
        </p>
        <LoginForm next={typeof next === "string" ? next : ""} />
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          ¿Tu taller aún no tiene cuenta?{" "}
          <Link href="/registro-taller" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Solicita el alta
          </Link>
          . La revisamos con los documentos de tu negocio (KYB).
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
