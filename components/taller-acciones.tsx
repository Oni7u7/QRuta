"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Suspender o reactivar un taller (el servidor firma en el contrato y actualiza la base).
export function TallerAcciones({ id, nombre, estado }: { id: string; nombre: string; estado: "pendiente" | "aprobado" | "suspendido" }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const accion = estado === "suspendido" ? "reactivar" : "suspender";

  async function ejecutar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/talleres/${id}/${accion}`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) return setError(json?.error ?? "No se pudo completar la acción");
      setTx(json.stellar_expert);
      setConfirmando(false);
      router.refresh();
    } catch {
      setError("Sin conexión con el servidor. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className={`text-sm font-medium hover:underline ${
            accion === "suspender" ? "text-red-700 dark:text-red-400" : "text-teal-700 dark:text-teal-400"
          }`}
        >
          {accion === "suspender" ? "Suspender" : "Reactivar"}
          <span className="sr-only"> {nombre}</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{accion === "suspender" ? "¿Suspender? Ya no podrá firmar." : "¿Reactivar? Podrá firmar de nuevo."}</span>
          <button
            type="button"
            onClick={ejecutar}
            disabled={ocupado}
            className={`rounded-lg px-3 py-1.5 font-medium text-white disabled:cursor-wait disabled:opacity-70 ${
              accion === "suspender" ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700"
            }`}
          >
            {ocupado ? "Firmando en Stellar…" : "Sí"}
          </button>
          <button type="button" onClick={() => setConfirmando(false)} disabled={ocupado} className="rounded-lg border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
            No
          </button>
        </div>
      )}
      {tx && (
        <a href={tx} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
          Ver transacción<span className="sr-only"> en Stellar Expert (abre en otra pestaña)</span>
        </a>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
