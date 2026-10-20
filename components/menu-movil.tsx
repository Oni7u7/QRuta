"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

// Menú desplegable para pantallas angostas: el botón alterna el panel, que se cierra al elegir un enlace o con Escape.
export function MenuMovil({ links }: { links: { href: string; label: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        className="flex size-9 flex-col items-center justify-center gap-[5px] rounded-lg text-texto hover:bg-fondo"
      >
        {/* Tres barras que se vuelven una X al abrir. */}
        <span className={`h-0.5 w-5 bg-current motion-safe:transition-transform ${abierto ? "translate-y-[7px] rotate-45" : ""}`} />
        <span className={`h-0.5 w-5 bg-current motion-safe:transition-opacity ${abierto ? "opacity-0" : ""}`} />
        <span className={`h-0.5 w-5 bg-current motion-safe:transition-transform ${abierto ? "-translate-y-[7px] -rotate-45" : ""}`} />
      </button>
      <div id={id} hidden={!abierto} className="absolute inset-x-0 top-full border-b border-linea bg-superficie shadow-sm">
        <ul className="mx-auto max-w-5xl px-4 py-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setAbierto(false)}
                className="block border-b border-linea py-3 text-[17px] font-semibold text-texto last:border-0 hover:text-enlace"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
