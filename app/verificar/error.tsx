"use client";

export default function VerificarError() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
        <h1 className="text-lg font-semibold">No se pudo verificar la unidad</h1>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          Hubo un problema al consultar el expediente. Esto no significa que la unidad esté vencida. Intenta de nuevo en unos
          segundos; si el código ya cambió, vuelve a escanear el QR de la pantalla.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Intentar de nuevo
        </button>
      </div>
    </main>
  );
}
