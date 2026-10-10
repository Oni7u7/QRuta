import type { Metadata } from "next";
import Link from "next/link";
import { TallerForm } from "@/components/taller-form";
import { formatFecha } from "@/components/ui";
import { getTaller } from "@/lib/auth";
import { TIPO_LABEL } from "@/lib/config";
import { ultimosDelTaller } from "@/lib/historial";

export const metadata: Metadata = {
  title: "Registrar servicio · QRuta",
};

export default async function TallerPage() {
  // El layout muestra el aviso de acceso; aquí solo evitamos consultar datos sin permiso.
  const taller = await getTaller();
  if (taller?.estado !== "aprobado") return null;
  const recientes = await ultimosDelTaller(taller.id);

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Registrar servicio</h1>
      <p className="mt-2 mb-8 text-zinc-600 dark:text-zinc-400">
        Captura el mantenimiento de la unidad. Al firmar, el expediente se ancla en Stellar y queda verificable con el QR de la
        unidad.
      </p>
      <TallerForm tallerNombre={taller.nombre} />

      <section className="mt-14" aria-labelledby="recientes">
        <h2 id="recientes" className="text-lg font-semibold">
          Tus últimos servicios
        </h2>
        {recientes.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Aún no has registrado servicios.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {recientes.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link
                    href={`/taller/unidad?p=${s.placa}`}
                    className="font-mono font-medium tracking-wider hover:text-teal-700 hover:underline dark:hover:text-teal-400"
                  >
                    {s.placa}
                  </Link>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    {TIPO_LABEL[s.tipo]} · {formatFecha(s.fecha)}
                  </p>
                </div>
                <a
                  href={s.stellar_expert}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-teal-700 hover:underline dark:text-teal-400"
                >
                  Ver tx<span className="sr-only"> de {s.placa} en Stellar Expert (abre en otra pestaña)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
