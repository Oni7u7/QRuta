import { describe, expect, it } from "vitest";
import { anularSchema, hashSchema, renovarSchema } from "@/lib/expedientes-schemas";

const HASH = "a".repeat(64);

describe("acciones de /admin sobre expedientes", () => {
  it("la huella debe ser SHA-256 en hexadecimal y se normaliza a minúsculas", () => {
    expect(hashSchema.parse(`  ${"A".repeat(64)} `)).toBe(HASH);
    expect(hashSchema.safeParse("a".repeat(63)).success).toBe(false);
    expect(hashSchema.safeParse("g".repeat(64)).success).toBe(false);
  });

  it("el motivo de anulación cabe en los límites del contrato (3 a 200)", () => {
    expect(anularSchema.safeParse({ hash: HASH, motivo: "ok" }).success).toBe(false);
    expect(anularSchema.safeParse({ hash: HASH, motivo: "x".repeat(201) }).success).toBe(false);
    expect(anularSchema.parse({ hash: HASH, motivo: "  Datos falsos  " }).motivo).toBe("Datos falsos");
  });

  it("renovar normaliza la placa como el resto de la app", () => {
    expect(renovarSchema.parse({ placa: "rec-345" }).placa).toBe("REC345");
    expect(renovarSchema.safeParse({ placa: "ab" }).success).toBe(false);
    expect(renovarSchema.safeParse({}).success).toBe(false);
  });
});
