import { construirQr } from "@/lib/qr-marca";

// QR de marca. El fondo es siempre blanco (también en modo oscuro) para que lo lea cualquier cámara.
export function QrMarca({ valor, titulo, className = "" }: { valor: string; titulo: string; className?: string }) {
  const { tamano, modulos, esquinas, logo } = construirQr(valor);
  const { centro: c, ventana: a, nucleo: b } = logo;
  return (
    <svg
      viewBox={`0 0 ${tamano} ${tamano}`}
      shapeRendering="geometricPrecision"
      role="img"
      aria-label={titulo}
      className={className}
    >
      <rect width={tamano} height={tamano} className="fill-blanco" />
      <path d={modulos} className="fill-grafito" />
      {esquinas.map(({ x, y }) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width={7} height={7} rx={0.45} className="fill-grafito" />
          <rect x={x + 1} y={y + 1} width={5} height={5} rx={0.25} className="fill-blanco" />
          {/* Núcleo todo en Grafito: un centro naranja rompe la proporción 1:1:3:1:1 con la que los lectores
              encuentran las esquinas y el QR deja de leerse de cerca (probado con jsQR y ZXing). */}
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.2} className="fill-grafito" />
        </g>
      ))}
      <polygon points={logo.hexagono} strokeWidth={logo.trazo} strokeLinejoin="round" className="fill-grafito stroke-grafito" />
      <rect x={c - a} y={c - a} width={2 * a} height={2 * a} rx={logo.ventanaRx} className="fill-blanco" />
      <rect x={c - b} y={c - b} width={2 * b} height={2 * b} rx={logo.nucleoRx} className="fill-naranja" />
    </svg>
  );
}
