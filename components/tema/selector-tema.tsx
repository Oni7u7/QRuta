"use client";

import { useEffect, useState } from "react";
import { CLAVE_TEMA } from "@/lib/tema";

// Interruptor claro/oscuro. Por defecto se usa el tema del sistema; al elegir uno se guarda en localStorage.
// El script de app/layout.tsx aplica el tema antes de pintar (sin parpadeo).
type Tema = "light" | "dark";

function temaActual(): Tema {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function SelectorTema() {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    setTema(temaActual());
    // Si no hay elección guardada, seguir los cambios del sistema.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => {
      let guardado: string | null = null;
      try {
        guardado = localStorage.getItem(CLAVE_TEMA);
      } catch {}
      if (guardado) return;
      document.documentElement.dataset.theme = media.matches ? "dark" : "light";
      setTema(temaActual());
    };
    media.addEventListener("change", alCambiar);
    return () => media.removeEventListener("change", alCambiar);
  }, []);

  function cambiar() {
    const nuevo: Tema = temaActual() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {}
    setTema(nuevo);
  }

  const oscuro = tema === "dark";
  return (
    <button
      type="button"
      onClick={cambiar}
      aria-label={oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={oscuro ? "Tema claro" : "Tema oscuro"}
      className="flex size-9 items-center justify-center rounded-lg text-texto hover:bg-fondo"
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        {oscuro ? (
          <>
            <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}
