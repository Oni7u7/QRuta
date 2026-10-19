"use client";

import Link from "next/link";
import { useState } from "react";
import { PDF_MAX_BYTES } from "@/lib/config";
import { inputClass } from "./ui";

const CAMPOS = [
  { name: "nombre_comercial", label: "Nombre comercial del taller", autoComplete: "organization", placeholder: "Taller Hernández", max: 120 },
  { name: "rfc", label: "RFC del negocio", autoComplete: "off", placeholder: "HEHJ800101AB1", max: 15, mayusculas: true, ayuda: "12 caracteres si es persona moral, 13 si es persona física." },
  { name: "responsable", label: "Nombre del responsable", autoComplete: "name", placeholder: "Juan Hernández López", max: 120 },
  { name: "email", label: "Correo electrónico", type: "email", autoComplete: "email", placeholder: "taller@ejemplo.com", max: 200, ayuda: "Aquí te llegará la invitación cuando aprobemos tu solicitud." },
  { name: "telefono", label: "Teléfono", type: "tel", autoComplete: "tel", placeholder: "55 1234 5678", max: 20, inputMode: "tel" as const, ayuda: "10 dígitos." },
] as const;

export function RegistroForm() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pdf = form.get("documento");
    if (pdf instanceof File && pdf.size > PDF_MAX_BYTES) return setError("El PDF debe pesar 4 MB o menos.");
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/solicitudes", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) return setError(json?.error ?? "No se pudo enviar la solicitud");
      setEnviada(String(form.get("email") ?? ""));
    } catch {
      setError("Sin conexión con el servidor. Revisa tu red e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviada) {
    return (
      <section aria-live="polite" className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Recibimos tu solicitud</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          QRuta revisará los datos y el documento de tu taller. Si todo está en orden, te enviaremos una invitación a{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{enviada}</span> para que crees tu contraseña.
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>Revisamos tu solicitud (KYB).</li>
          <li>Te llega el correo de invitación y eliges tu contraseña.</li>
          <li>Inicias sesión, conectas tu wallet de Freighter y empiezas a firmar servicios.</li>
        </ol>
        <Link href="/" className="mt-5 inline-block text-sm font-medium text-teal-700 hover:underline dark:text-teal-400">
          Volver al inicio
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" encType="multipart/form-data">
      {CAMPOS.map((c) => (
        <div key={c.name}>
          <label htmlFor={c.name} className="text-sm font-medium">
            {c.label}
          </label>
          <input
            id={c.name}
            name={c.name}
            type={"type" in c ? c.type : "text"}
            required
            maxLength={c.max}
            autoComplete={c.autoComplete}
            inputMode={"inputMode" in c ? c.inputMode : undefined}
            placeholder={c.placeholder}
            aria-describedby={"ayuda" in c ? `${c.name}-ayuda` : undefined}
            className={`${inputClass} ${"mayusculas" in c ? "uppercase" : ""}`}
          />
          {"ayuda" in c && (
            <p id={`${c.name}-ayuda`} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {c.ayuda}
            </p>
          )}
        </div>
      ))}

      <div>
        <label htmlFor="domicilio" className="text-sm font-medium">
          Domicilio del taller
        </label>
        <textarea
          id="domicilio"
          name="domicilio"
          required
          rows={2}
          maxLength={300}
          autoComplete="street-address"
          placeholder="Calle, número, colonia, alcaldía o municipio, código postal"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="documento" className="text-sm font-medium">
          Documento del negocio (PDF)
        </label>
        <input
          id="documento"
          name="documento"
          type="file"
          required
          accept="application/pdf,.pdf"
          aria-describedby="documento-ayuda"
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2.5 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:hover:file:bg-zinc-700"
        />
        <p id="documento-ayuda" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Por ejemplo, tu constancia de situación fiscal. Solo PDF, máximo 4 MB. Solo QRuta podrá verlo.
        </p>
      </div>

      {/* Campo trampa contra bots: oculto para personas y lectores de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="sitio_web">Sitio web</label>
        <input id="sitio_web" name="sitio_web" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <details className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <summary className="cursor-pointer font-medium">Aviso de privacidad</summary>
        <div className="mt-3 space-y-2 text-zinc-600 dark:text-zinc-400">
          <p>
            QRuta, proyecto en fase de prueba, es responsable de los datos que nos compartes en esta solicitud: nombre comercial,
            RFC, responsable, correo, teléfono, domicilio y el documento adjunto.
          </p>
          <p>
            Los usamos únicamente para verificar la identidad de tu taller (KYB), darte de alta en la plataforma y comunicarnos
            contigo. No los vendemos ni los compartimos con terceros. El documento se guarda en un almacenamiento privado al que
            solo tienen acceso los administradores de QRuta.
          </p>
          <p>Puedes pedir en cualquier momento el acceso, la corrección o la eliminación de tus datos escribiendo al equipo de QRuta.</p>
        </div>
      </details>

      <label className="flex items-start gap-3 text-sm">
        <input id="acepto_privacidad" name="acepto_privacidad" type="checkbox" required className="mt-0.5 size-4 accent-teal-600" />
        <span>He leído y acepto el aviso de privacidad.</span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 font-medium text-white hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70 sm:w-auto dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
      >
        {enviando && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
        {enviando ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}
