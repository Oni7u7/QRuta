import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContrasenaForm } from "@/components/contrasena-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { supabaseSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Elige tu contraseña · QRuta",
  robots: { index: false },
};

export default async function ContrasenaPage() {
  const sb = await supabaseSession();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-sm px-4 py-12 sm:py-20">
        <h1 className="titulo">Elige tu contraseña</h1>
        <p className="mt-2 mb-8 text-texto-2">
          Con ella entrarás a QRuta como <span className="font-semibold text-texto">{user.email}</span>.
        </p>
        <ContrasenaForm />
      </main>
      <SiteFooter />
    </>
  );
}
