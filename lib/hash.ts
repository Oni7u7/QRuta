import { createHash } from "node:crypto";
import type { Tipo } from "./config";

export type ExpedienteData = {
  placa: string;
  tipo: Tipo;
  fecha: string; // YYYY-MM-DD
  notas: string;
  firmado_por: string;
};

// Las claves se escriben en orden fijo para que el hash sea determinista
// y cualquiera pueda recalcularlo a partir de los datos públicos.
export function canonicalJson(e: ExpedienteData) {
  return JSON.stringify({
    placa: e.placa,
    tipo: e.tipo,
    fecha: e.fecha,
    notas: e.notas,
    firmado_por: e.firmado_por,
  });
}

export function hashExpediente(e: ExpedienteData) {
  return createHash("sha256").update(canonicalJson(e), "utf8").digest("hex");
}
