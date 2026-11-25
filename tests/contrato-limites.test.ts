import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIPOS, VIGENCIA_DIAS } from "@/lib/config";
import { completarExpediente, expedienteSchema } from "@/lib/expediente";

// El contrato v2 (contracts/qruta-registry) rechaza:
// - vigente_hasta - fecha > (días del tipo + 1) * 86400  -> VigenciaInvalida
// - fecha > hora del ledger + 2 días                       -> FechaFutura
// Estas pruebas aseguran que lo que arma la app siempre cabe en esos límites.
const DIA = 86_400;
const AHORA = Date.UTC(2026, 10, 25, 0, 0, 30);
const taller = { id: "t1", nombre: "Taller", rfc: null, estado: "aprobado" as const, stellar_address: "G" };
const checklist = { frenos: "ok", llantas: "ok", luces: "ok", direccion: "ok", suspension: "ok", cinturones: "ok" };

function armar(tipo: string, fecha: string) {
  const input = expedienteSchema.parse({ placa: "ABC123", tipo, fecha, kilometraje: 1000, checklist });
  return completarExpediente(input, taller);
}

describe("límites del contrato v2", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  it("la vigencia que calcula la app nunca excede la del tipo en el contrato", () => {
    for (const tipo of TIPOS) {
      const e = armar(tipo, "2026-11-24");
      const duracion = e.vigenteHastaUnix - e.fechaUnix;
      expect(duracion).toBeGreaterThan(0);
      expect(duracion).toBeLessThanOrEqual((VIGENCIA_DIAS[tipo] + 1) * DIA);
    }
  });

  it("la fecha más adelantada que acepta la app cabe en la tolerancia del contrato", () => {
    // La app acepta hasta mañana (UTC); justo después de medianoche es el caso más adelantado.
    const e = armar("correctivo", "2026-11-26");
    expect(e.fechaUnix - Math.floor(AHORA / 1000)).toBeLessThanOrEqual(2 * DIA);
  });
});
