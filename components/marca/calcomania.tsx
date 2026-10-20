import { Isotipo } from "./logo";

// Calcomanía para la unidad: fondo Naranja y todo en Grafito.
export function Calcomania({ placa, className = "" }: { placa?: string; className?: string }) {
  return (
    <div className={`rounded-2xl bg-naranja p-6 text-grafito ${className}`}>
      <Isotipo variant="sobreNaranja" alto={40} />
      <p className="mt-5 text-[28px] leading-tight font-extrabold tracking-tight">Unidad verificable</p>
      <p className="mt-1 text-[17px] font-semibold">Escanea el QR de la pantalla.</p>
      {placa && <p className="mt-4 text-sm font-semibold tracking-[0.12em] uppercase">Unidad {placa}</p>}
    </div>
  );
}
