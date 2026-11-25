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

// Componentes que el taller revisa en cada servicio (el orden fija el hash).
export const CHECKLIST_ITEMS = [
  { key: "frenos", label: "Frenos" },
  { key: "llantas", label: "Llantas" },
  { key: "luces", label: "Luces" },
  { key: "direccion", label: "Dirección" },
  { key: "suspension", label: "Suspensión" },
  { key: "cinturones", label: "Cinturones" },
] as const;
export type ChecklistKey = (typeof CHECKLIST_ITEMS)[number]["key"];

export const CHECK_VALORES = ["ok", "atencion", "falla"] as const;
export type CheckValor = (typeof CHECK_VALORES)[number];
export type Checklist = Record<ChecklistKey, CheckValor>;

export const CHECK_LABEL: Record<CheckValor, string> = {
  ok: "OK",
  atencion: "Atención",
  falla: "Falla",
};

// Documento de la solicitud de alta. Vercel rechaza peticiones de más de 4.5 MB: el PDF se limita a 4 MB.
export const PDF_MAX_BYTES = 4 * 1024 * 1024;

// Una unidad vigente se muestra "Por vencer" cuando le quedan estos días o menos (solo presentación).
export const DIAS_POR_VENCER = 15;

// Segundos que dura cada token TOTP del QR.
export const TOTP_STEP = 15;

// ── Red de Stellar ─────────────────────────────────────────────────
// NEXT_PUBLIC_STELLAR_NETWORK elige la red: "testnet" (por defecto) o "mainnet".
// Es pública a propósito: el navegador la necesita para exigir la misma red en Freighter.

export const REDES = ["testnet", "mainnet"] as const;
export type Red = (typeof REDES)[number];

export type ConfigRed = {
  nombre: string;
  passphrase: string;
  horizonUrl: string;
  // SDF solo ofrece Soroban RPC público en testnet; en mainnet se usa STELLAR_RPC_URL.
  rpcUrl: string | null;
  exploradorUrl: string;
  friendbot: boolean;
};

const CONFIG_REDES: Record<Red, ConfigRed> = {
  testnet: {
    nombre: "Testnet",
    passphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
    rpcUrl: "https://soroban-testnet.stellar.org",
    exploradorUrl: "https://stellar.expert/explorer/testnet",
    friendbot: true,
  },
  mainnet: {
    nombre: "Mainnet",
    passphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
    rpcUrl: null,
    exploradorUrl: "https://stellar.expert/explorer/public",
    friendbot: false,
  },
};

export function parseRed(valor: string | undefined): Red {
  const v = (valor ?? "").trim().toLowerCase();
  if (!v) return "testnet";
  if ((REDES as readonly string[]).includes(v)) return v as Red;
  throw new Error('NEXT_PUBLIC_STELLAR_NETWORK no es válida: usa "testnet" o "mainnet"');
}

export function configRed(red: Red): ConfigRed {
  return CONFIG_REDES[red];
}

// Next solo lleva al navegador las variables NEXT_PUBLIC_ que se leen de forma literal.
export const RED: Red = parseRed(process.env.NEXT_PUBLIC_STELLAR_NETWORK);
export const RED_STELLAR: ConfigRed = configRed(RED);

// URL de Soroban RPC (solo servidor). STELLAR_RPC_URL la reemplaza; en mainnet es obligatoria.
export function sorobanRpcUrl(red: Red = RED) {
  const url = process.env.STELLAR_RPC_URL?.trim() || configRed(red).rpcUrl;
  if (!url) throw new Error("Falta STELLAR_RPC_URL (obligatoria en mainnet)");
  return url;
}

// ID del contrato qruta-registry (C...) en la red configurada. Solo se lee en el servidor.
export function contractId() {
  const id = process.env.QRUTA_CONTRACT_ID;
  if (!id) throw new Error("Falta QRUTA_CONTRACT_ID");
  return id;
}

export function stellarExpertContractUrl(id: string, red: Red = RED) {
  return `${configRed(red).exploradorUrl}/contract/${id}`;
}

export function stellarExpertTxUrl(txHash: string, red: Red = RED) {
  return `${configRed(red).exploradorUrl}/tx/${txHash}`;
}

export function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function vigenteHasta(tipo: Tipo, fecha: string) {
  const d = new Date(`${fecha}T23:59:59.999Z`);
  d.setUTCDate(d.getUTCDate() + VIGENCIA_DIAS[tipo]);
  return d;
}
