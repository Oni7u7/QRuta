// Logo de QRuta (manual de identidad v1.0). Isotipo: tuerca hexagonal con una ventana y un núcleo (el "ojo" del QR).
// Proporciones con x = lado del núcleo: núcleo 1x, ventana 2.2x, tuerca 4.4x × 5x. Área de respeto: 1x por lado.

export type LogoLayout = "horizontal" | "vertical" | "isotipo";
export type LogoVariant = "positivo" | "negativo" | "sobreNaranja" | "tintaNegra" | "tintaBlanca";

type Colores = { tuerca: string; ventana: string; nucleo: string; nombre: string };

const COLORES: Record<LogoVariant, Colores> = {
  positivo: { tuerca: "fill-grafito stroke-grafito", ventana: "fill-blanco", nucleo: "fill-naranja", nombre: "text-grafito" },
  negativo: { tuerca: "fill-naranja stroke-naranja", ventana: "fill-grafito", nucleo: "fill-naranja", nombre: "text-blanco" },
  sobreNaranja: { tuerca: "fill-grafito stroke-grafito", ventana: "fill-naranja", nucleo: "fill-grafito", nombre: "text-grafito" },
  tintaNegra: { tuerca: "fill-negro stroke-negro", ventana: "fill-blanco", nucleo: "fill-negro", nombre: "text-negro" },
  // La ventana se recorta (máscara) para dejar ver el fondo.
  tintaBlanca: { tuerca: "fill-blanco stroke-blanco", ventana: "", nucleo: "fill-blanco", nombre: "text-blanco" },
};

// Tamaños mínimos del manual: isotipo 16 px; logotipo 96 px de ancho (≈ 30 px de alto de tuerca en horizontal).
const ALTO_MINIMO: Record<LogoLayout, number> = { isotipo: 16, horizontal: 30, vertical: 30 };
// El nombre mide 0.76 del alto de la tuerca.
const PROPORCION_NOMBRE = 0.76;
// Lado del núcleo (x) respecto al alto de la tuerca (5x): 1/5.
const X = 1 / 5;

export function Isotipo({ variant = "positivo", alto }: { variant?: LogoVariant; alto: number }) {
  const c = COLORES[variant];
  const recorte = variant === "tintaBlanca";
  return (
    <svg viewBox="0 0 44 50" width={(alto * 44) / 50} height={alto} aria-hidden="true" className="block shrink-0">
      {recorte && (
        <mask id="qruta-recorte-ventana">
          <rect width="44" height="50" fill="white" />
          <rect x="11" y="14" width="22" height="22" rx="5" fill="black" />
        </mask>
      )}
      <polygon
        points="22,2 42,13.5 42,36.5 22,48 2,36.5 2,13.5"
        strokeWidth="4"
        strokeLinejoin="round"
        className={c.tuerca}
        mask={recorte ? "url(#qruta-recorte-ventana)" : undefined}
      />
      {!recorte && <rect x="11" y="14" width="22" height="22" rx="5" className={c.ventana} />}
      <rect x="17" y="20" width="10" height="10" rx="2.5" className={c.nucleo} />
    </svg>
  );
}

export function Logo({
  layout = "horizontal",
  variant = "positivo",
  alto = 32,
  conAreaDeRespeto = true,
  className = "",
}: {
  layout?: LogoLayout;
  variant?: LogoVariant;
  /** Alto de la tuerca en px. Se respeta el mínimo del manual. */
  alto?: number;
  /** Margen libre de 1x alrededor (desactívalo solo si el contenedor ya lo da). */
  conAreaDeRespeto?: boolean;
  className?: string;
}) {
  const h = Math.max(alto, ALTO_MINIMO[layout]);
  const respeto = conAreaDeRespeto ? h * X : 0;
  const nombre = (
    <span
      className={`font-extrabold leading-none tracking-tight ${COLORES[variant].nombre}`}
      style={{ fontSize: h * PROPORCION_NOMBRE }}
    >
      QRuta
    </span>
  );
  return (
    <span
      role="img"
      aria-label="QRuta"
      className={`inline-flex items-center ${layout === "vertical" ? "flex-col" : "flex-row"} ${className}`}
      style={{ padding: respeto, gap: layout === "isotipo" ? 0 : h * X * (layout === "vertical" ? 1 : 1.2) }}
    >
      <Isotipo variant={variant} alto={h} />
      {layout !== "isotipo" && nombre}
    </span>
  );
}
