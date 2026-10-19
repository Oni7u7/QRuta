import type { Metadata } from "next";
import Link from "next/link";
import { RegistroForm } from "@/components/registro-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Registra tu taller · QRuta",
  description: "Solicita el alta de tu taller en QRuta para firmar expedientes de mantenimiento verificables.",
};

export default function RegistroTallerPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Registra tu taller</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Solo los talleres verificados pueden firmar expedientes en QRuta. Envíanos los datos de tu negocio y un documento que
          lo acredite; si todo está en orden, te mandaremos una invitación por correo.
        </p>
        <p className="mt-2 mb-8 text-sm text-zinc-500 dark:text-zinc-400">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Inicia sesión
          </Link>
        </p>
        <RegistroForm />
      </main>
      <SiteFooter />
    </>
  );
}
