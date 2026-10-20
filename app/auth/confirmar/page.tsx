"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Destino del enlace de invitación. Supabase redirige aquí con los tokens en el fragmento (#...),
// que nunca llega al servidor por sí solo: lo leemos y lo enviamos para crear la sesión con cookie httpOnly.
export default function ConfirmarPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    const datos = new URLSearchParams(window.location.hash.slice(1));
    // Borra los tokens de la barra de direcciones y del historial.
    window.history.replaceState(null, "", window.location.pathname);

    if (datos.get("error")) {
      setError(
        datos.get("error_code") === "otp_expired"
          ? "El enlace ya caducó o ya se usó. Pide a QRuta un enlace nuevo."
          : "El enlace no es válido. Pide a QRuta un enlace nuevo.",
      );
      return;
    }
    const access_token = datos.get("access_token");
    const refresh_token = datos.get("refresh_token");
    if (!access_token || !refresh_token) {
      setError("El enlace está incompleto. Ábrelo directamente desde el correo o pide a QRuta uno nuevo.");
      return;
    }
    fetch("/api/auth/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token }),
    })
      .then(async (r) => {
        if (r.ok) return router.replace("/cuenta/contrasena");
        setError((await r.json().catch(() => null))?.error ?? "No se pudo iniciar tu sesión.");
      })
      .catch(() => setError("Sin conexión con el servidor. Recarga la página para intentarlo de nuevo."));
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-12">
      {error ? (
        <div role="alert" className="tarjeta border-l-4 border-l-vencido p-6">
          <h1 className="subtitulo">No pudimos abrir tu invitación</h1>
          <p className="mt-2 text-sm text-texto">{error}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-enlace hover:underline">
            Ir a iniciar sesión
          </Link>
        </div>
      ) : (
        <p role="status" className="text-center text-texto-2">
          Abriendo tu invitación…
        </p>
      )}
    </main>
  );
}
