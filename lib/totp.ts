import { authenticator } from "otplib";
import { TOTP_STEP } from "./config";

// window: 1 acepta el token anterior y el siguiente (tolerancia de ±15 s).
authenticator.options = { step: TOTP_STEP, window: 1 };

export function generateSecret() {
  return authenticator.generateSecret();
}

export function currentToken(secret: string) {
  return authenticator.generate(secret);
}

export function isValidToken(token: string, secret: string) {
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
}

// Segundos hasta el siguiente cambio de token.
export function secondsRemaining() {
  return authenticator.timeRemaining();
}
