// La sesión del taller solo la lee el servidor: la cookie no necesita ser accesible desde JavaScript.
export const SESSION_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;
