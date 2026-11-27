"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inputClass } from "./ui";

type Accion = "anular" | "renovar";

// Anular un expediente o renovar su placa en el contrato (el servidor firma con la cuenta admin).
export function ExpedienteAcciones({ hash, placa, anulado }: { hash: string; placa: string; anulado: boolean }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<Accion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<{ accion: Accion; url: string } | null>(null);

  async function ejecutar(accion: Accion) {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(accion === "anular" ? "/api/admin/expedientes/anular" : "/api/admin/unidades/renovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accion === "anular" ? { hash, motivo } : { placa }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) return setError(json?.error ?? "No se pudo completar la acción");
      setTx({ accion, url: json.stellar_expert });
      setAbierta(null);
      setMotivo("");
      router.refresh();
    } catch {
      setError("Sin conexión con el servidor. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {abierta === null && (
        <div className="flex gap-4 text-sm font-semibold">
          <button type="button" onClick={() => setAbierta("renovar")} className="text-enlace hover:underline">
            Renovar<span className="sr-only"> la placa {placa} en el contrato</span>
          </button>
          {!anulado && (
            <button type="button" onClick={() => setAbierta("anular")} className="text-texto-vencido hover:underline">
              Anular<span className="sr-only"> el servicio de {placa}</span>
            </button>
          )}
        </div>
      )}

      {abierta === "renovar" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>¿Mantener {placa} en la red hasta que venza su servicio?</span>
          <button
            type="button"
            onClick={() => ejecutar("renovar")}
            disabled={ocupado}
            className="rounded-lg bg-naranja px-3 py-1.5 font-semibold text-grafito hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
          >
            {ocupado ? "Firmando en Stellar…" : "Sí"}
          </button>
          <button type="button" onClick={() => setAbierta(null)} disabled={ocupado} className="rounded-lg border border-borde px-3 py-1.5">
            No
          </button>
        </div>
      )}

      {abierta === "anular" && (
        <form
          className="flex w-full flex-col gap-2 text-sm sm:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar("anular");
          }}
        >
          <label htmlFor={`motivo-${hash}`}>Motivo de la anulación (queda en Stellar)</label>
          <input
            id={`motivo-${hash}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            minLength={3}
            maxLength={200}
            required
            className={inputClass}
            placeholder="Ej. Factura del servicio no coincide"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={ocupado || motivo.trim().length < 3}
              className="rounded-lg bg-vencido px-3 py-1.5 font-semibold text-blanco hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {ocupado ? "Firmando en Stellar…" : "Anular servicio"}
            </button>
            <button type="button" onClick={() => setAbierta(null)} disabled={ocupado} className="rounded-lg border border-borde px-3 py-1.5">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {tx && (
        <a href={tx.url} target="_blank" rel="noopener noreferrer" className="text-xs text-texto-2 underline-offset-4 hover:underline">
          {tx.accion === "anular" ? "Anulado" : "Renovado"}: ver transacción
          <span className="sr-only"> en Stellar Expert (abre en otra pestaña)</span>
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
