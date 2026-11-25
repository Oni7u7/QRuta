import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOTP_STEP } from "@/lib/config";
import { currentToken, generateSecret, isValidToken, secondsRemaining } from "@/lib/totp";

// Inicio de una ventana de 15 s (múltiplo exacto de TOTP_STEP).
const T0 = Date.UTC(2026, 10, 24, 12, 0, 0);

describe("QR TOTP", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("genera tokens de 6 dígitos", () => {
    vi.setSystemTime(T0);
    expect(currentToken(generateSecret())).toMatch(/^\d{6}$/);
  });

  it("el token dura TOTP_STEP segundos", () => {
    const secreto = generateSecret();
    vi.setSystemTime(T0);
    const token = currentToken(secreto);
    vi.setSystemTime(T0 + (TOTP_STEP - 1) * 1000);
    expect(currentToken(secreto)).toBe(token);
    vi.setSystemTime(T0 + TOTP_STEP * 1000);
    expect(currentToken(secreto)).not.toBe(token);
  });

  it("acepta el token anterior por un paso y lo rechaza después", () => {
    const secreto = generateSecret();
    vi.setSystemTime(T0);
    const token = currentToken(secreto);
    vi.setSystemTime(T0 + TOTP_STEP * 1000);
    expect(isValidToken(token, secreto)).toBe(true);
    vi.setSystemTime(T0 + 2 * TOTP_STEP * 1000);
    expect(isValidToken(token, secreto)).toBe(false);
  });

  it("rechaza tokens de otro secreto o mal formados", () => {
    vi.setSystemTime(T0);
    const secreto = generateSecret();
    expect(isValidToken(currentToken(generateSecret()), secreto)).toBe(false);
    expect(isValidToken("abc", secreto)).toBe(false);
    expect(isValidToken("", secreto)).toBe(false);
  });

  it("cuenta los segundos hasta el siguiente token", () => {
    vi.setSystemTime(T0 + 4000);
    expect(secondsRemaining()).toBe(TOTP_STEP - 4);
  });
});
