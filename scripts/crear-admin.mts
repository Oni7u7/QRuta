// Crea un administrador de QRuta (revisa solicitudes y aprueba talleres en /admin).
//
// Uso:
//   node --env-file=.env.local scripts/crear-admin.mts --email admin@ejemplo.com --nombre "Ana Pérez"
//
// Opciones:
//   --password <texto>   contraseña inicial (si se omite, se genera una aleatoria y se imprime una sola vez)
//
// Una cuenta de administrador no puede ser también un taller: usa un correo distinto al de cualquier taller.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    nombre: { type: "string" },
    password: { type: "string" },
  },
});

const email = values.email?.trim().toLowerCase();
const nombre = values.nombre?.trim();
if (!email || !nombre || nombre.length < 2 || nombre.length > 80) {
  console.error('Faltan datos. Ejemplo: --email admin@ejemplo.com --nombre "Ana Pérez"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local)");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const generada = !values.password;
const password = values.password ?? randomBytes(12).toString("base64url");

const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error || !data.user) {
  console.error("No se pudo crear el usuario:", error?.message);
  process.exit(1);
}

const { error: adminError } = await sb.from("admins").insert({ id: data.user.id, nombre });
if (adminError) {
  // Sin fila en admins el usuario no sirve: lo borramos para poder reintentar.
  await sb.auth.admin.deleteUser(data.user.id);
  console.error("No se pudo registrar el administrador:", adminError.message);
  process.exit(1);
}

console.log(`Administrador creado: ${nombre} <${email}>`);
if (generada) console.log(`Contraseña inicial (no se volverá a mostrar): ${password}`);
console.log("Entra en /login con ese correo y contraseña; te llevará a /admin.");
