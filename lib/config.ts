export const TIPOS = ["preventivo", "correctivo", "verificacion"] as const;
export type Tipo = (typeof TIPOS)[number];

// Días de vigencia de cada tipo de servicio.
export const VIGENCIA_DIAS: Record<Tipo, number> = {
  preventivo: 90,
  correctivo: 30,
  verificacion: 180,
};

export const TIPO_LABEL: Record<Tipo, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  verificacion: "Verificación",
};

// Segundos que dura cada token TOTP del QR.
export const TOTP_STEP = 15;

export const STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";

export function stellarExpertTxUrl(txHash: string) {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

export function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function vigenteHasta(tipo: Tipo, fecha: string) {
  const d = new Date(`${fecha}T23:59:59.999Z`);
  d.setUTCDate(d.getUTCDate() + VIGENCIA_DIAS[tipo]);
  return d;
}
