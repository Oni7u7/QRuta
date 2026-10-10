import { createHash } from "node:crypto";
import { CHECKLIST_ITEMS, type Checklist, type Tipo } from "./config";

export type ExpedienteV1 = {
  placa: string;
  tipo: Tipo;
  fecha: string; // YYYY-MM-DD
  notas: string;
  firmado_por: string;
};

export type ExpedienteV2 = ExpedienteV1 & {
  kilometraje: number;
  checklist: Checklist;
  taller_id: string;
};

// Las claves se escriben en orden fijo para que el hash sea determinista
// y pueda recalcularse a partir de los datos guardados.
export function canonicalJsonV1(e: ExpedienteV1) {
  return JSON.stringify({
    placa: e.placa,
    tipo: e.tipo,
    fecha: e.fecha,
    notas: e.notas,
    firmado_por: e.firmado_por,
  });
}

export function canonicalJsonV2(e: ExpedienteV2) {
  return JSON.stringify({
    v: 2,
    placa: e.placa,
    tipo: e.tipo,
    fecha: e.fecha,
    kilometraje: e.kilometraje,
    checklist: Object.fromEntries(CHECKLIST_ITEMS.map(({ key }) => [key, e.checklist[key]])),
    notas: e.notas,
    firmado_por: e.firmado_por,
    taller_id: e.taller_id,
  });
}

function sha256(s: string) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function hashExpedienteV1(e: ExpedienteV1) {
  return sha256(canonicalJsonV1(e));
}

export function hashExpedienteV2(e: ExpedienteV2) {
  return sha256(canonicalJsonV2(e));
}

// Recalcula el hash de un expediente guardado según su versión.
export function recomputeHash(
  version: number,
  e: ExpedienteV1 & { kilometraje: number | null; checklist: unknown; taller_id: string | null },
) {
  if (version === 2) {
    if (e.kilometraje == null || !e.taller_id) return null;
    return hashExpedienteV2({ ...e, kilometraje: e.kilometraje, checklist: e.checklist as Checklist, taller_id: e.taller_id });
  }
  return hashExpedienteV1(e);
}
