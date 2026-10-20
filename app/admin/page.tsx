import Link from "next/link";
import { EstadoBadge, type TonoEstado } from "@/components/marca/estado-unidad";
import { TallerAcciones } from "@/components/taller-acciones";
import { abreviar, formatFecha } from "@/components/ui";
import { getAdmin } from "@/lib/auth";
import { listarSolicitudes, type Solicitud } from "@/lib/solicitudes-admin";
import { listarTalleres, type TallerAdmin } from "@/lib/talleres-admin";

// Estados con los colores del manual: siempre icono + palabra.
const ESTADO: Record<Solicitud["estado"], { texto: string; tono: TonoEstado }> = {
  pendiente: { texto: "Pendiente", tono: "por-vencer" },
  aprobada: { texto: "Aprobada", tono: "vigente" },
  rechazada: { texto: "Rechazada", tono: "vencido" },
};

export default async function AdminPage() {
  // El layout muestra el aviso de acceso; aquí solo evitamos consultar datos sin permiso.
  if (!(await getAdmin())) return null;

  const [{ pendientes, revisadas }, talleres] = await Promise.all([listarSolicitudes(), listarTalleres()]);

  return (
    <>
      <h1 className="titulo">Panel de administración</h1>
      <p className="mt-2 text-texto-2">Revisa las solicitudes de alta y administra los talleres de QRuta.</p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        <Resumen titulo="Solicitudes pendientes" valor={pendientes.length} texto="Talleres que esperan la revisión de su KYB." />
        <Resumen titulo="Talleres aprobados" valor={talleres.filter((t) => t.estado === "aprobado").length} texto="Pueden iniciar sesión y firmar servicios." />
      </ul>

      <section className="mt-12" aria-labelledby="pendientes">
        <h2 id="pendientes" className="text-lg font-semibold">
          Solicitudes pendientes
        </h2>
        {pendientes.length === 0 ? (
          <p className="mt-3 text-sm text-texto-2">No hay solicitudes por revisar.</p>
        ) : (
          <Lista solicitudes={pendientes} />
        )}
      </section>

      <section className="mt-12" aria-labelledby="talleres">
        <h2 id="talleres" className="text-lg font-semibold">
          Talleres
        </h2>
        {talleres.length === 0 ? (
          <p className="mt-3 text-sm text-texto-2">Aún no hay talleres.</p>
        ) : (
          <ul className="mt-3 divide-y divide-linea rounded-xl border border-linea">
            {talleres.map((t) => (
              <TallerFila key={t.id} t={t} />
            ))}
          </ul>
        )}
      </section>

      {revisadas.length > 0 && (
        <section className="mt-12" aria-labelledby="revisadas">
          <h2 id="revisadas" className="text-lg font-semibold">
            Revisadas recientemente
          </h2>
          <Lista solicitudes={revisadas} />
        </section>
      )}
    </>
  );
}

function Resumen({ titulo, valor, texto }: { titulo: string; valor: number; texto: string }) {
  return (
    <li className="rounded-2xl border border-linea p-5">
      <p className="text-sm text-texto-2">{titulo}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-sm text-texto-2">{texto}</p>
    </li>
  );
}

const ESTADO_TALLER: Record<TallerAdmin["estado"], { texto: string; tono: TonoEstado }> = {
  aprobado: { texto: "Activo", tono: "vigente" },
  suspendido: { texto: "Suspendido", tono: "vencido" },
  pendiente: { texto: "Pendiente", tono: "por-vencer" },
};

function TallerFila({ t }: { t: TallerAdmin }) {
  const wallet = !t.stellar_address
    ? "Sin wallet"
    : t.onChain === true
      ? `Wallet ${abreviar(t.stellar_address)} · aprobada en el contrato`
      : t.onChain === false
        ? `Wallet ${abreviar(t.stellar_address)} · no aprobada en el contrato`
        : `Wallet ${abreviar(t.stellar_address)} · sin respuesta de Stellar`;
  return (
    <li className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{t.nombre}</p>
          <EstadoBadge tono={ESTADO_TALLER[t.estado].tono}>{ESTADO_TALLER[t.estado].texto}</EstadoBadge>
        </div>
        <p className="truncate text-texto-2">
          {t.email ?? "sin correo"}
          {t.rfc && (
            <>
              {" · "}
              <span className="font-mono">{t.rfc}</span>
            </>
          )}
        </p>
        <p className="text-texto-2">
          <span className="font-mono">{wallet}</span> · {t.servicios} {t.servicios === 1 ? "servicio" : "servicios"}
        </p>
      </div>
      <TallerAcciones id={t.id} nombre={t.nombre} estado={t.estado} />
    </li>
  );
}

function Lista({ solicitudes }: { solicitudes: Solicitud[] }) {
  return (
    <ul className="mt-3 divide-y divide-linea rounded-xl border border-linea">
      {solicitudes.map((s) => (
        <li key={s.id}>
          <Link
            href={`/admin/solicitudes/${s.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-fondo"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{s.nombre_comercial}</p>
              <p className="truncate text-texto-2">
                <span className="font-mono">{s.rfc}</span> · {s.email}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <EstadoBadge tono={ESTADO[s.estado].tono}>{ESTADO[s.estado].texto}</EstadoBadge>
              <span className="text-xs text-texto-2">{formatFecha(s.revisada_at ?? s.created_at)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
