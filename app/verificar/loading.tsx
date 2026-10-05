import { SiteHeader } from "@/components/site-header";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14" role="status" aria-label="Verificando unidad">
        <div className="h-36 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Verificando unidad…</p>
      </main>
    </>
  );
}
