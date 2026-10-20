export function SiteFooter() {
  return (
    <footer className="border-t border-linea">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-texto-2 sm:flex-row sm:items-center sm:justify-between">
        <p>QRuta · MVP fase 1</p>
        <p className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-naranja" aria-hidden="true" />
          Opera en Stellar testnet: los registros son de demostración y no tienen validez legal.
        </p>
      </div>
    </footer>
  );
}
