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
      <div className="border-b border-linea bg-fondo">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{admin?.nombre ?? "Sin acceso"}</span>
            {admin && (
              <span className="shrink-0 rounded-full bg-grafito px-2 py-0.5 text-xs font-semibold text-blanco dark:bg-blanco dark:text-grafito">
                Administrador
              </span>
            )}
          </div>
          <form action={logout}>
            <button type="submit" className="font-semibold text-texto-2 hover:text-texto">
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
    <div role="alert" className="tarjeta mx-auto max-w-md border-l-4 border-l-por-vencer p-6">
      <h1 className="subtitulo">Sin acceso</h1>
      <p className="mt-2 text-sm text-texto">Esta sección es solo para administradores de QRuta.</p>
    </div>
  );
}
