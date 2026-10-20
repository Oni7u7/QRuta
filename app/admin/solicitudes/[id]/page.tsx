import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SolicitudAcciones } from "@/components/solicitud-acciones";
import { formatFecha } from "@/components/ui";
import { getAdmin } from "@/lib/auth";
import { formatTelefono, idValido, obtenerSolicitud } from "@/lib/solicitudes-admin";

export const metadata: Metadata = {
  title: "Solicitud de alta · QRuta",
  robots: { index: false },
};

export default async function SolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return null;
  const id = idValido((await params).id);
  const s = id ? await obtenerSolicitud(id) : null;
  if (!s) notFound();

  const campos: [string, React.ReactNode][] = [
    ["Nombre comercial", s.nombre_comercial],
    ["RFC", <span key="rfc" className="font-mono">{s.rfc}</span>],
    ["Responsable", s.responsable],
    ["Correo", s.email],
    ["Teléfono", formatTelefono(s.telefono)],
    ["Domicilio", s.domicilio],
    ["Solicitud enviada", new Date(s.created_at).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })],
    ["Aviso de privacidad", `Aceptado el ${formatFecha(s.acepto_privacidad_at, "long")}`],
  ];

  return (
    <>
      <Link href="/admin" className="text-sm font-semibold text-enlace hover:underline">
        ← Volver al panel
      </Link>
      <h1 className="titulo mt-4">{s.nombre_comercial}</h1>
      <p className="mt-1 text-texto-2">Solicitud de alta #{s.id}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="datos" className="min-w-0">
          <h2 id="datos" className="text-sm font-semibold">
            Datos de la solicitud
          </h2>
          <dl className="mt-2 divide-y divide-linea rounded-xl border border-linea px-4 text-sm">
            {campos.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-texto-2">{k}</dt>
                <dd className="font-semibold break-words">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6">
            <SolicitudAcciones
              id={s.id}
              estado={s.estado}
              email={s.email}
              motivo={s.motivo_rechazo}
              revisadaPor={s.admins?.nombre ?? null}
              revisadaAt={s.revisada_at}
            />
          </div>
        </section>

        <section aria-labelledby="documento" className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="documento" className="text-sm font-semibold">
              Documento del negocio
            </h2>
            <a
              href={`/api/admin/solicitudes/${s.id}/documento`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-enlace hover:underline"
            >
              Abrir en otra pestaña<span className="sr-only"> (PDF)</span>
            </a>
          </div>
          <iframe
            src={`/api/admin/solicitudes/${s.id}/documento`}
            title={`Documento de ${s.nombre_comercial}`}
            className="mt-2 h-[70vh] w-full rounded-xl border border-linea bg-superficie"
          />
        </section>
      </div>
    </>
  );
}
