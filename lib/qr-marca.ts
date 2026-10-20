import qrcode from "qrcode-generator";

// QR de marca (diseño de UX/UI, función buildQrSvg de "QR rotativo con triángulos"): módulos triangulares,
// esquinas redondeadas y el logo al centro. Única diferencia con el original: las esquinas no llevan el
// cuadrito naranja central, porque impedía leer el QR a alta resolución. Aquí solo se calcula la geometría;
// el dibujo y los colores (tokens de la marca) están en components/marca/qr-marca.tsx.

const ZONA_SILENCIO = 4;
const FRACCION_LOGO = 0.27;
const K = 0.66; // tamaño del triángulo respecto al centro del módulo

export type QrMarca = {
  tamano: number; // lado total del viewBox, en módulos (incluye la zona de silencio)
  modulos: string; // un solo path con todos los triángulos
  esquinas: { x: number; y: number }[];
  logo: { hexagono: string; trazo: number; centro: number; ventana: number; ventanaRx: number; nucleo: number; nucleoRx: number };
};

const f = (v: number) => v.toFixed(2);

export function construirQr(texto: string): QrMarca {
  const q = qrcode(0, "H");
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  const T = n + 2 * ZONA_SILENCIO;
  const mitad = (((n * FRACCION_LOGO) / 2) * 1.12);
  const medio = n / 2;
  const enEsquina = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const bajoLogo = (r: number, c: number) => Math.abs(r + 0.5 - medio) < mitad && Math.abs(c + 0.5 - medio) < mitad;

  // Módulos: triángulos que alternan hacia arriba / abajo según (fila + columna) % 2.
  const d: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c) || enEsquina(r, c) || bajoLogo(r, c)) continue;
      const cx = c + ZONA_SILENCIO + 0.5;
      const cy = r + ZONA_SILENCIO + 0.5;
      const pts =
        (r + c) % 2 === 0
          ? [[cx, cy - K], [cx + K, cy + K * 0.8], [cx - K, cy + K * 0.8]]
          : [[cx, cy + K], [cx + K, cy - K * 0.8], [cx - K, cy - K * 0.8]];
      d.push("M" + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + "Z");
    }
  }

  // Esquinas de posición (arriba-izquierda, arriba-derecha, abajo-izquierda).
  const esquinas = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ].map(([fila, col]) => ({ x: col + ZONA_SILENCIO, y: fila + ZONA_SILENCIO }));

  // Logo: hexágono con vértice arriba y puntas redondeadas, ventana blanca y núcleo naranja.
  const L = n * FRACCION_LOGO;
  const c0 = T / 2;
  const R = (L / 2) * 0.98;
  const trazo = L * 0.12;
  const Ri = R - trazo * 0.6;
  const hexagono = Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return `${f(c0 + Ri * Math.cos(a))},${f(c0 + Ri * Math.sin(a))}`;
  }).join(" ");

  return {
    tamano: T,
    modulos: d.join(""),
    esquinas,
    logo: { hexagono, trazo, centro: c0, ventana: L * 0.3, ventanaRx: L * 0.1, nucleo: L * 0.13, nucleoRx: L * 0.04 },
  };
}
