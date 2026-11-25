import { describe, expect, it } from "vitest";
import { TIPOS, VIGENCIA_DIAS, vigenteHasta } from "@/lib/config";

describe("vigenteHasta", () => {
  it("usa los días de cada tipo de servicio", () => {
    expect(VIGENCIA_DIAS).toEqual({ preventivo: 90, correctivo: 30, verificacion: 180 });
  });

  it("cuenta desde el final del día del servicio, en UTC", () => {
    expect(vigenteHasta("correctivo", "2026-10-20").toISOString()).toBe("2026-11-19T23:59:59.999Z");
    expect(vigenteHasta("preventivo", "2026-10-20").toISOString()).toBe("2027-01-18T23:59:59.999Z");
    expect(vigenteHasta("verificacion", "2026-10-20").toISOString()).toBe("2027-04-18T23:59:59.999Z");
  });

  it("cruza fin de mes y año bisiesto", () => {
    expect(vigenteHasta("correctivo", "2028-02-15").toISOString()).toBe("2028-03-16T23:59:59.999Z");
    expect(vigenteHasta("correctivo", "2026-12-31").toISOString()).toBe("2027-01-30T23:59:59.999Z");
  });

  it("siempre termina después de la fecha del servicio", () => {
    for (const tipo of TIPOS) {
      expect(vigenteHasta(tipo, "2026-11-24").getTime()).toBeGreaterThan(Date.parse("2026-11-24T23:59:59Z"));
    }
  });
});
