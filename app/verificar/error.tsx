"use client";

export default function VerificarError() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <div role="alert" className="tarjeta border-l-4 border-l-por-vencer p-6">
        <h1 className="subtitulo">No se pudo verificar la unidad</h1>
        <p className="mt-2 text-sm text-texto">
          Hubo un problema al consultar el expediente. Esto no significa que la unidad esté vencida. Intenta de nuevo en unos
          segundos; si el código ya cambió, vuelve a escanear el QR de la pantalla.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primario mt-4"
        >
          Intentar de nuevo
        </button>
      </div>
    </main>
  );
}
