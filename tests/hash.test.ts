import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Checklist } from "@/lib/config";
import { canonicalJsonV2, hashExpedienteV1, hashExpedienteV2, recomputeHash, type ExpedienteV2 } from "@/lib/hash";

const checklist: Checklist = { frenos: "ok", llantas: "ok", luces: "ok", direccion: "ok", suspension: "ok", cinturones: "ok" };
const exp: ExpedienteV2 = {
  placa: "REC345",
  tipo: "correctivo",
  fecha: "2026-10-20",
  notas: "",
  firmado_por: "Taller de prueba",
  kilometraje: 128400,
  checklist,
  taller_id: "00000000-0000-0000-0000-000000000001",
};

describe("huella del expediente", () => {
  it("es SHA-256 en hexadecimal del JSON canónico", () => {
    const esperado = createHash("sha256").update(canonicalJsonV2(exp), "utf8").digest("hex");
    expect(hashExpedienteV2(exp)).toBe(esperado);
    expect(hashExpedienteV2(exp)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no depende del orden de las claves", () => {
    const desordenado = {
      ...exp,
      checklist: { cinturones: "ok", suspension: "ok", direccion: "ok", luces: "ok", llantas: "ok", frenos: "ok" } as Checklist,
    };
    const invertido = Object.fromEntries(Object.entries(desordenado).reverse()) as ExpedienteV2;
    expect(hashExpedienteV2(invertido)).toBe(hashExpedienteV2(exp));
  });

  it("cambia si se altera cualquier dato", () => {
    const original = hashExpedienteV2(exp);
    expect(hashExpedienteV2({ ...exp, kilometraje: 128401 })).not.toBe(original);
    expect(hashExpedienteV2({ ...exp, checklist: { ...checklist, frenos: "falla" } })).not.toBe(original);
    expect(hashExpedienteV2({ ...exp, fecha: "2026-10-21" })).not.toBe(original);
    expect(hashExpedienteV2({ ...exp, notas: " " })).not.toBe(original);
  });

  it("v1 y v2 dan huellas distintas para los mismos datos", () => {
    expect(hashExpedienteV1(exp)).not.toBe(hashExpedienteV2(exp));
  });

  it("recomputeHash recalcula según la versión guardada", () => {
    expect(recomputeHash(2, exp)).toBe(hashExpedienteV2(exp));
    expect(recomputeHash(1, exp)).toBe(hashExpedienteV1(exp));
  });

  it("recomputeHash devuelve null si a un v2 le faltan datos", () => {
    expect(recomputeHash(2, { ...exp, kilometraje: null })).toBeNull();
    expect(recomputeHash(2, { ...exp, taller_id: null })).toBeNull();
  });
});
