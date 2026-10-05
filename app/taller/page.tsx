import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TallerForm } from "@/components/taller-form";

export const metadata: Metadata = {
  title: "Registrar servicio · QRuta",
};

export default function TallerPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Registrar servicio</h1>
        <p className="mt-2 mb-8 text-zinc-600 dark:text-zinc-400">
          Captura el mantenimiento de la unidad. Al firmar, el expediente se ancla en Stellar y queda verificable con el QR de la
          unidad.
        </p>
        <TallerForm />
      </main>
      <SiteFooter />
    </>
  );
}
