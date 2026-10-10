import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Acceso para talleres · QRuta",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-sm px-4 py-12 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight">Acceso para talleres</h1>
        <p className="mt-2 mb-8 text-zinc-600 dark:text-zinc-400">
          Solo los talleres verificados por QRuta pueden firmar expedientes.
        </p>
        <LoginForm next={typeof next === "string" ? next : "/taller"} />
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          ¿Tu taller aún no tiene cuenta? Las altas se hacen tras verificar los documentos del negocio (KYB).
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
