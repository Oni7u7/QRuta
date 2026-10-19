import Link from "next/link";
import { TallerAcciones } from "@/components/taller-acciones";
import { abreviar, formatFecha } from "@/components/ui";
import { getAdmin } from "@/lib/auth";
import { listarSolicitudes, type Solicitud } from "@/lib/solicitudes-admin";
import { listarTalleres, type TallerAdmin } from "@/lib/talleres-admin";

const ESTADO: Record<Solicitud["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  aprobada: { texto: "Aprobada", clase: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  rechazada: { texto: "Rechazada", clase: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export default async function AdminPage() {
  // El layout muestra el aviso de acceso; aquí solo evitamos consultar datos sin permiso.
  if (!(await getAdmin())) return null;

  const [{ pendientes, revisadas }, talleres] = await Promise.all([listarSolicitudes(), listarTalleres()]);

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Panel de administración</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">Revisa las solicitudes de alta y administra los talleres de QRuta.</p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        <Resumen titulo="Solicitudes pendientes" valor={pendientes.length} texto="Talleres que esperan la revisión de su KYB." />
        <Resumen titulo="Talleres aprobados" valor={talleres.filter((t) => t.estado === "aprobado").length} texto="Pueden iniciar sesión y firmar servicios." />
      </ul>

      <section className="mt-12" aria-labelledby="pendientes">
        <h2 id="pendientes" className="text-lg font-semibold">
          Solicitudes pendientes
        </h2>
        {pendientes.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No hay solicitudes por revisar.</p>
        ) : (
          <Lista solicitudes={pendientes} />
        )}
      </section>

      <section className="mt-12" aria-labelledby="talleres">
        <h2 id="talleres" className="text-lg font-semibold">
          Talleres
        </h2>
        {talleres.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Aún no hay talleres.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
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
    <li className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{titulo}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{texto}</p>
    </li>
  );
}

const ESTADO_TALLER: Record<TallerAdmin["estado"], { texto: string; clase: string }> = {
  aprobado: { texto: "Activo", clase: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  suspendido: { texto: "Suspendido", clase: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  pendiente: { texto: "Pendiente", clase: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
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
          <p className="truncate font-medium">{t.nombre}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_TALLER[t.estado].clase}`}>{ESTADO_TALLER[t.estado].texto}</span>
        </div>
        <p className="truncate text-zinc-500 dark:text-zinc-400">
          {t.email ?? "sin correo"}
          {t.rfc && (
            <>
              {" · "}
              <span className="font-mono">{t.rfc}</span>
            </>
          )}
        </p>
        <p className="text-zinc-500 dark:text-zinc-400">
          <span className="font-mono">{wallet}</span> · {t.servicios} {t.servicios === 1 ? "servicio" : "servicios"}
        </p>
      </div>
      <TallerAcciones id={t.id} nombre={t.nombre} estado={t.estado} />
    </li>
  );
}

function Lista({ solicitudes }: { solicitudes: Solicitud[] }) {
  return (
    <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {solicitudes.map((s) => (
        <li key={s.id}>
          <Link
            href={`/admin/solicitudes/${s.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{s.nombre_comercial}</p>
              <p className="truncate text-zinc-500 dark:text-zinc-400">
                <span className="font-mono">{s.rfc}</span> · {s.email}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO[s.estado].clase}`}>{ESTADO[s.estado].texto}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatFecha(s.revisada_at ?? s.created_at)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
