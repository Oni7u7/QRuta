import type { Metadata } from "next";
import { Logo } from "@/components/logo";
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
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4">
        <Logo />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Pantalla de la unidad</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        {placa.length >= 3 && placa.length <= 10 ? <PantallaQR key={placa} placa={placa} /> : <SinPlaca />}
      </main>
    </div>
  );
}

function SinPlaca() {
  return (
    <form action="/pantalla" className="w-full max-w-sm">
      <h1 className="text-xl font-semibold">Abrir pantalla de una unidad</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Escribe la placa para mostrar su QR de verificación.</p>
      <label htmlFor="p" className="mt-6 block text-sm font-medium">
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
          className="block w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base uppercase placeholder:text-zinc-400 focus:border-teal-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-teal-400"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-lg bg-teal-600 px-4 font-medium text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
        >
          Mostrar QR
        </button>
      </div>
    </form>
  );
}
