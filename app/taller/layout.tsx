import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { EstadoBadge } from "@/components/marca/estado-unidad";
import { getAdmin, getTaller } from "@/lib/auth";

export const dynamic = "force-dynamic";

// El middleware ya exige sesión; aquí se exige además un taller con KYB aprobado.
export default async function TallerLayout({ children }: { children: React.ReactNode }) {
  const taller = await getTaller();
  // Un administrador no es un taller: su lugar es /admin.
  if (!taller && (await getAdmin())) redirect("/admin");

  return (
    <>
      <SiteHeader />
      <div className="border-b border-linea bg-fondo">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{taller?.nombre ?? "Cuenta sin taller"}</span>
            {taller?.estado === "aprobado" && (
              <EstadoBadge tono="vigente">Verificado</EstadoBadge>
            )}
          </div>
          <nav aria-label="Taller" className="flex items-center gap-4">
            {taller?.estado === "aprobado" && (
              <>
                <Link href="/taller" className="text-texto-2 hover:text-texto">
                  Registrar
                </Link>
                <Link href="/taller/unidad" className="text-texto-2 hover:text-texto">
                  Buscar unidad
                </Link>
              </>
            )}
            <form action={logout}>
              <button type="submit" className="font-semibold text-texto-2 hover:text-texto">
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
    <div role="alert" className="tarjeta mx-auto max-w-md border-l-4 border-l-por-vencer p-6">
      <h1 className="subtitulo">Sin permiso para firmar</h1>
      <p className="mt-2 text-sm text-texto">{texto}</p>
    </div>
  );
}
