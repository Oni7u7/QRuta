import Link from "next/link";
import { logout } from "@/app/login/actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getTaller } from "@/lib/auth";

export const dynamic = "force-dynamic";

// El middleware ya exige sesión; aquí se exige además un taller con KYB aprobado.
export default async function TallerLayout({ children }: { children: React.ReactNode }) {
  const taller = await getTaller();

  return (
    <>
      <SiteHeader />
      <div className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{taller?.nombre ?? "Cuenta sin taller"}</span>
            {taller?.estado === "aprobado" && (
              <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                Verificado
              </span>
            )}
          </div>
          <nav aria-label="Taller" className="flex items-center gap-4">
            {taller?.estado === "aprobado" && (
              <>
                <Link href="/taller" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  Registrar
                </Link>
                <Link href="/taller/unidad" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  Buscar unidad
                </Link>
              </>
            )}
            <form action={logout}>
              <button type="submit" className="font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                Salir
              </button>
            </form>
          </nav>
        </div>
      </div>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        {taller?.estado === "aprobado" ? children : <SinAcceso estado={taller?.estado} />}
      </main>
      <SiteFooter />
    </>
  );
}

function SinAcceso({ estado }: { estado?: string }) {
  const texto =
    estado === "pendiente"
      ? "Tu taller está en revisión. Cuando QRuta verifique tus documentos (KYB) podrás firmar expedientes."
      : estado === "suspendido"
        ? "Tu taller está suspendido y no puede firmar expedientes. Contacta a QRuta."
        : "Esta cuenta no está asociada a ningún taller registrado en QRuta.";
  return (
    <div role="alert" className="mx-auto max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
      <h1 className="text-lg font-semibold">Sin permiso para firmar</h1>
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{texto}</p>
    </div>
  );
}
