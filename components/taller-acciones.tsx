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
          className={`text-sm font-semibold hover:underline ${
            accion === "suspender" ? "text-texto-vencido" : "text-enlace"
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
            className={`rounded-lg px-3 py-1.5 font-semibold disabled:cursor-wait disabled:opacity-70 ${
              accion === "suspender" ? "bg-vencido text-blanco hover:brightness-95" : "bg-naranja text-grafito hover:brightness-95"
            }`}
          >
            {ocupado ? "Firmando en Stellar…" : "Sí"}
          </button>
          <button type="button" onClick={() => setConfirmando(false)} disabled={ocupado} className="rounded-lg border border-borde px-3 py-1.5">
            No
          </button>
        </div>
      )}
      {tx && (
        <a href={tx} target="_blank" rel="noopener noreferrer" className="text-xs text-texto-2 underline-offset-4 hover:underline">
          Ver transacción<span className="sr-only"> en Stellar Expert (abre en otra pestaña)</span>
        </a>
      )}
      {error && (
        <p role="alert" className="text-xs text-texto-vencido">
          {error}
        </p>
      )}
    </div>
  );
}
