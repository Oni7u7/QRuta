import type { Metadata } from "next";
import { BovedaPanel } from "@/components/boveda-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BOVEDA_CONTRACT_ID, BOVEDA_RED, urlContrato } from "@/lib/boveda";

// Bóveda que se entregó al reto y se abrió en una prueba (ya vacía).
const BOVEDA_PRIMERA = "CA2LMHZ2F6RMDDCAATKDLQG2FSKRDWWMPBQ7DABFLSXZIJK7ZUVDDTUY";

export const metadata: Metadata = {
  title: "Bóveda · QRuta",
  description: "Bóveda en Stellar testnet: se abre solo con el código correcto.",
};

export default function BovedaPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <p className="font-mono text-sm font-bold uppercase text-oxido">Reto exprés · Stellar testnet</p>
        <h1 className="mt-2 text-4xl font-extrabold uppercase leading-none sm:text-5xl">La bóveda</h1>
        <p className="mt-4 text-texto-2">
          Un contrato de QRuta guarda XLM de testnet y solo los entrega a quien escriba el código correcto. El contrato no guarda el
          código, solo su huella SHA-256, y se abre una sola vez.
        </p>
        <div className="mt-8">
          <BovedaPanel />
        </div>
        <p className="mt-6 border-2 border-texto p-3 text-sm text-texto-2">
          <strong className="text-texto">Nota para los jueces:</strong> la primera bóveda (
          <a href={`${BOVEDA_RED.exploradorUrl}/contract/${BOVEDA_PRIMERA}`} target="_blank" rel="noopener noreferrer" className="enlace font-mono">
            CA2L…DTUY
          </a>
          ) se abrió por error durante una prueba del equipo. Esta pantalla ya usa la bóveda vigente, con 5,555 XLM y el mismo código.
        </p>
        <p className="mt-4 break-all font-mono text-xs text-texto-2">
          Contrato vigente:{" "}
          <a href={urlContrato()} target="_blank" rel="noopener noreferrer" className="enlace">
            {BOVEDA_CONTRACT_ID}
            <span className="sr-only"> (abre en otra pestaña)</span>
          </a>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
