"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inputClass } from "./ui";

type Props = {
  id: number;
  estado: "pendiente" | "aprobada" | "rechazada";
  email: string;
  motivo: string | null;
  revisadaPor: string | null;
  revisadaAt: string | null;
};

type Resultado = { tipo: "correo" } | { tipo: "enlace"; enlace: string };

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

export function SolicitudAcciones({ id, estado, email, motivo, revisadaPor, revisadaAt }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function post(ruta: string, body?: unknown) {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/solicitudes/${id}/${ruta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "No se pudo completar la acción");
        return null;
      }
      return json;
    } catch {
      setError("Sin conexión con el servidor. Intenta de nuevo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function aprobar() {
    const r = await post("aprobar");
    if (!r) return;
    setConfirmando(false);
    setResultado(r.enlace ? { tipo: "enlace", enlace: r.enlace } : { tipo: "correo" });
    router.refresh();
  }

  async function rechazar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await post("rechazar", { motivo: new FormData(e.currentTarget).get("motivo") });
    if (r) router.refresh();
  }

  async function nuevoEnlace() {
    const r = await post("enlace");
    if (r) setResultado({ tipo: "enlace", enlace: r.enlace });
  }

  async function copiar(texto: string, campo: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      campo?.select();
    }
  }

  const aviso = error && (
    <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {error}
    </p>
  );

  const bloqueResultado = resultado && (
    <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm dark:border-teal-900 dark:bg-teal-950">
      {resultado.tipo === "correo" ? (
        <p>
          <strong className="font-semibold">Taller aprobado.</strong> Enviamos la invitación a {email}. Si no le llega, genera un enlace
          para compartírselo.
        </p>
      ) : (
        <>
          <p>
            <strong className="font-semibold">Comparte este enlace con el taller.</strong> Es de un solo uso y caduca pronto; con él
            entra a QRuta y elige su contraseña. No lo publiques.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              id={`enlace-${id}`}
              readOnly
              value={resultado.enlace}
              aria-label="Enlace de invitación"
              className={`${inputClass} mt-0 font-mono text-xs`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={(e) => copiar(resultado.enlace, e.currentTarget.previousElementSibling as HTMLInputElement)}
              className="h-11 shrink-0 rounded-lg bg-teal-600 px-4 font-medium text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-zinc-950"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (estado === "rechazada") {
    return (
      <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="font-semibold">Solicitud rechazada</p>
        {revisadaAt && (
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            {revisadaPor ? `Por ${revisadaPor}, ` : ""}
            {fechaHora(revisadaAt)}
          </p>
        )}
        {motivo && <p className="mt-2">Motivo: {motivo}</p>}
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">Avísale al taller por correo o teléfono; QRuta no le envía el rechazo.</p>
      </div>
    );
  }

  if (estado === "aprobada") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="font-semibold text-teal-700 dark:text-teal-400">Solicitud aprobada</p>
          {revisadaAt && (
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              {revisadaPor ? `Por ${revisadaPor}, ` : ""}
              {fechaHora(revisadaAt)}
            </p>
          )}
          <button
            type="button"
            onClick={nuevoEnlace}
            disabled={ocupado}
            className="mt-3 text-sm font-medium text-teal-700 hover:underline disabled:opacity-60 dark:text-teal-400"
          >
            {ocupado ? "Generando…" : "Generar enlace de acceso para el taller"}
          </button>
        </div>
        {bloqueResultado}
        {aviso}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Revisa que los datos coincidan con el documento antes de aprobar. Al aprobar se crea la cuenta del taller y se le envía la
        invitación a <span className="font-medium text-zinc-900 dark:text-zinc-100">{email}</span>.
      </p>

      {!rechazando && !confirmando && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-600 px-5 font-medium text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
          >
            Aprobar y enviar invitación
          </button>
          <button
            type="button"
            onClick={() => setRechazando(true)}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Rechazar
          </button>
        </div>
      )}

      {confirmando && (
        <div className="rounded-xl border border-teal-200 p-4 text-sm dark:border-teal-900">
          <p className="font-medium">¿Confirmas que los datos y el documento coinciden?</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={aprobar}
              disabled={ocupado}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-600 px-5 font-medium text-white hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70 dark:bg-teal-500 dark:text-zinc-950"
            >
              {ocupado ? "Aprobando…" : "Sí, aprobar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={ocupado}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {rechazando && (
        <form onSubmit={rechazar} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <label htmlFor="motivo" className="text-sm font-medium">
            Motivo del rechazo
          </label>
          <textarea
            id="motivo"
            name="motivo"
            required
            minLength={5}
            maxLength={500}
            rows={3}
            placeholder="El RFC no coincide con la constancia de situación fiscal."
            className={inputClass}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={ocupado}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 font-medium text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-70 dark:bg-red-500 dark:text-zinc-950"
            >
              {ocupado ? "Rechazando…" : "Rechazar solicitud"}
            </button>
            <button
              type="button"
              onClick={() => setRechazando(false)}
              disabled={ocupado}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {bloqueResultado}
      {aviso}
    </div>
  );
}
