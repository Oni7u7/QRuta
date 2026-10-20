"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TOTP_STEP } from "@/lib/config";

type Estado =
  | { tipo: "cargando" }
  | { tipo: "listo"; url: string; expira: number }
  | { tipo: "no_registrada" }
  | { tipo: "error" };

// Margen para pedir el token nuevo un poco después del cambio en el servidor.
const MARGEN_MS = 300;
const REINTENTO_MS = 3000;

export function PantallaQR({ placa }: { placa: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [reconectando, setReconectando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      const res = await fetch(`/api/pantalla/${encodeURIComponent(placa)}`, { cache: "no-store" });
      if (res.status === 404) {
        setEstado({ tipo: "no_registrada" });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { url, restante } = (await res.json()) as { url: string; restante: number };
      const expira = Date.now() + restante * 1000;
      setEstado({ tipo: "listo", url, expira });
      setReconectando(false);
      timer.current = setTimeout(cargar, restante * 1000 + MARGEN_MS);
    } catch {
      // Si ya había un QR lo seguimos mostrando: el servidor acepta el token anterior (window: 1).
      setEstado((prev) => (prev.tipo === "listo" ? prev : { tipo: "error" }));
      setReconectando(true);
      timer.current = setTimeout(cargar, REINTENTO_MS);
    }
  }, [placa]);

  useEffect(() => {
    cargar();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [cargar]);

  // Reloj para la barra de cuenta regresiva.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (estado.tipo === "no_registrada") {
    return (
      <Aviso titulo="Unidad no registrada" texto={`La placa ${placa} todavía no tiene servicios en QRuta.`}>
        <Link href="/taller" className="font-semibold text-naranja hover:underline">
          Registrar un servicio
        </Link>
      </Aviso>
    );
  }

  if (estado.tipo === "error") {
    return <Aviso titulo="Sin conexión" texto="No se pudo obtener el código. Reintentando…" />;
  }

  const restanteMs = estado.tipo === "listo" ? Math.max(0, estado.expira - ahora) : 0;
  const segundos = Math.ceil(restanteMs / 1000);
  const progreso = Math.min(1, restanteMs / (TOTP_STEP * 1000));

  // Siempre sobre Grafito (pantalla del dispositivo, igual en ambos temas).
  return (
    <div className="flex flex-col items-center text-center text-blanco">
      <p className="etiqueta opacity-80">Unidad</p>
      <p className="mt-1 text-4xl font-extrabold tracking-widest sm:text-5xl">{placa}</p>

      {/* El QR va en una tarjeta blanca para que lo lea cualquier cámara. */}
      <div className="mt-8 rounded-[20px] bg-blanco p-4">
        {estado.tipo === "listo" ? (
          <QRCodeSVG
            value={estado.url}
            size={280}
            level="M"
            marginSize={2}
            className="block size-64 sm:size-72"
            title={`Código QR de verificación de la unidad ${placa}`}
          />
        ) : (
          <div className="size-64 animate-pulse rounded-lg bg-papel sm:size-72" role="status" aria-label="Generando código" />
        )}
      </div>

      <div className="mt-6 w-64 sm:w-72">
        <p className="flex items-baseline justify-center gap-2 tabular-nums">
          {estado.tipo === "listo" ? (
            <>
              <span>Cambia en</span>
              <span className="text-xl font-semibold text-naranja">{segundos} s</span>
            </>
          ) : (
            "Generando código…"
          )}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blanco/15" aria-hidden="true">
          <div className="h-full rounded-full bg-naranja transition-[width] duration-300 ease-linear" style={{ width: `${progreso * 100}%` }} />
        </div>
      </div>

      <p className="mt-6 max-w-xs text-lg font-semibold">Escanea para verificar el mantenimiento</p>

      {reconectando && (
        <p role="status" className="mt-4 text-sm">
          Reconectando…
        </p>
      )}

      {estado.tipo === "listo" && (
        <a href={estado.url} target="_blank" rel="noopener noreferrer" className="mt-8 text-sm text-naranja underline-offset-4 hover:underline">
          Abrir la verificación en este equipo<span className="sr-only"> (abre en otra pestaña)</span>
        </a>
      )}
    </div>
  );
}

function Aviso({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div role="alert" className="mx-auto max-w-sm rounded-2xl border border-blanco/15 p-6 text-center text-blanco">
      <h2 className="subtitulo">{titulo}</h2>
      <p className="mt-2">{texto}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
