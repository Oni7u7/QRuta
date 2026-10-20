import type { Metadata } from "next";
import { Logo } from "@/components/marca/logo";
import { PantallaQR } from "@/components/pantalla-qr";
import { normalizePlaca } from "@/lib/placa";

export const metadata: Metadata = {
  title: "Pantalla de la unidad · QRuta",
};

// Simula la pantalla instalada en la unidad: sin navegación, solo el QR.
export default async function PantallaPage({ searchParams }: { searchParams: Promise<{ p?: string | string[] }> }) {
  const { p } = await searchParams;
  const placa = normalizePlaca(typeof p === "string" ? p.slice(0, 32) : "");

  return (
    // La pantalla del dispositivo es siempre Grafito, en ambos temas.
    <div className="flex min-h-dvh flex-col bg-grafito text-blanco">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        {placa.length >= 3 && placa.length <= 10 ? <PantallaQR key={placa} placa={placa} /> : <SinPlaca />}
      </main>
      <footer className="flex justify-center pb-6">
        <Logo variant="negativo" alto={32} />
      </footer>
    </div>
  );
}

function SinPlaca() {
  return (
    <form action="/pantalla" className="w-full max-w-sm">
      <h1 className="subtitulo">Abrir pantalla de una unidad</h1>
      <p className="mt-1">Escribe la placa para mostrar su QR de verificación.</p>
      <label htmlFor="p" className="mt-6 block text-sm font-semibold">
        Placa
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="p"
          name="p"
          required
          minLength={3}
          maxLength={12}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ABC-123"
          className="block w-full min-w-0 rounded-lg border border-blanco/30 bg-blanco px-3 py-2.5 text-base text-grafito uppercase placeholder:text-acero focus:border-naranja focus:outline-none"
        />
        <button type="submit" className="btn-primario shrink-0 px-4">
          Mostrar QR
        </button>
      </div>
    </form>
  );
}
