import { describe, expect, it } from "vitest";
import { TOTP_STEP } from "@/lib/config";

// Comprueba que vitest resuelve el alias "@/" igual que Next.
describe("entorno de pruebas", () => {
  it("resuelve el alias @/", () => {
    expect(TOTP_STEP).toBe(15);
  });
});
