import type { Metadata } from "next";
import { logout } from "@/app/login/actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administración · QRuta",
  robots: { index: false },
};

// El middleware ya exige sesión; aquí se exige además que el usuario sea administrador.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();

  return (
    <>
      <SiteHeader />
      <div className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{admin?.nombre ?? "Sin acceso"}</span>
            {admin && (
              <span className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                Administrador
              </span>
            )}
          </div>
          <form action={logout}>
            <button type="submit" className="font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Salir
            </button>
          </form>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">{admin ? children : <SinAcceso />}</main>
      <SiteFooter />
    </>
  );
}

function SinAcceso() {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
      <h1 className="text-lg font-semibold">Sin acceso</h1>
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">Esta sección es solo para administradores de QRuta.</p>
    </div>
  );
}
