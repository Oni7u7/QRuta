import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expedienteSchema } from "@/lib/expediente";
import { normalizePlaca, placaSchema } from "@/lib/placa";

describe("placa", () => {
  it("normaliza a mayúsculas sin espacios ni guiones", () => {
    expect(normalizePlaca("abc-12 3")).toBe("ABC123");
    expect(placaSchema.parse(" pop 063 ")).toBe("POP063");
  });

  it("rechaza placas demasiado cortas o largas", () => {
    expect(placaSchema.safeParse("A-1").success).toBe(false);
    expect(placaSchema.safeParse("ABCDEFGHIJK").success).toBe(false);
    expect(placaSchema.safeParse("x".repeat(40)).success).toBe(false);
  });
});

const checklist = { frenos: "ok", llantas: "ok", luces: "ok", direccion: "ok", suspension: "atencion", cinturones: "ok" };
const base = { placa: "rec-345", tipo: "correctivo", fecha: "2026-11-20", kilometraje: 128400, checklist, notas: "  Cambio de balatas  " };

describe("expedienteSchema", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 24, 18, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("acepta un expediente completo y limpia placa y notas", () => {
    const r = expedienteSchema.parse(base);
    expect(r.placa).toBe("REC345");
    expect(r.notas).toBe("Cambio de balatas");
  });

  it("pone notas vacías por defecto", () => {
    const { notas: _, ...sinNotas } = base;
    expect(expedienteSchema.parse(sinNotas).notas).toBe("");
  });

  it("rechaza fechas futuras, con un día de margen", () => {
    expect(expedienteSchema.safeParse({ ...base, fecha: "2026-11-25" }).success).toBe(true);
    expect(expedienteSchema.safeParse({ ...base, fecha: "2026-11-26" }).success).toBe(false);
  });

  it("rechaza fechas mal formadas", () => {
    expect(expedienteSchema.safeParse({ ...base, fecha: "24/11/2026" }).success).toBe(false);
    expect(expedienteSchema.safeParse({ ...base, fecha: "2026-13-40" }).success).toBe(false);
  });

  it("rechaza tipos y kilometrajes inválidos", () => {
    expect(expedienteSchema.safeParse({ ...base, tipo: "lavado" }).success).toBe(false);
    expect(expedienteSchema.safeParse({ ...base, kilometraje: -1 }).success).toBe(false);
    expect(expedienteSchema.safeParse({ ...base, kilometraje: 10.5 }).success).toBe(false);
    expect(expedienteSchema.safeParse({ ...base, kilometraje: "128400" }).success).toBe(false);
  });

  it("exige el checklist completo con valores válidos", () => {
    const { cinturones: _, ...incompleto } = checklist;
    expect(expedienteSchema.safeParse({ ...base, checklist: incompleto }).success).toBe(false);
    expect(expedienteSchema.safeParse({ ...base, checklist: { ...checklist, frenos: "bien" } }).success).toBe(false);
  });

  it("limita las notas a 1000 caracteres", () => {
    expect(expedienteSchema.safeParse({ ...base, notas: "a".repeat(1001) }).success).toBe(false);
  });
});
