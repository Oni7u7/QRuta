export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between dark:text-zinc-400">
        <p>QRuta · MVP fase 1</p>
        <p className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-amber-500" aria-hidden="true" />
          Opera en Stellar testnet: los registros son de demostración y no tienen validez legal.
        </p>
      </div>
    </footer>
  );
}
