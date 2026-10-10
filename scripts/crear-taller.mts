// Alta manual de un taller después de revisar sus documentos (KYB).
//
// Uso:
//   node --env-file=.env.local scripts/crear-taller.mts --email taller@ejemplo.com --nombre "Taller Hernández" --rfc HEHJ800101AB1
//
// Opciones:
//   --password <texto>   contraseña inicial (si se omite, se genera una aleatoria y se imprime una sola vez)
//   --estado <estado>    aprobado (por defecto) | pendiente | suspendido
//
// Para suspender o reactivar un taller después, cambia la columna `estado` en la tabla talleres.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    nombre: { type: "string" },
    rfc: { type: "string" },
    password: { type: "string" },
    estado: { type: "string", default: "aprobado" },
  },
});

const email = values.email?.trim();
const nombre = values.nombre?.trim();
const estado = values.estado ?? "aprobado";
if (!email || !nombre || nombre.length < 2 || nombre.length > 80) {
  console.error('Faltan datos. Ejemplo: --email taller@ejemplo.com --nombre "Taller Hernández" --rfc HEHJ800101AB1');
  process.exit(1);
}
if (!["aprobado", "pendiente", "suspendido"].includes(estado)) {
  console.error("--estado debe ser aprobado, pendiente o suspendido");
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

const { error: tallerError } = await sb
  .from("talleres")
  .insert({ id: data.user.id, nombre, rfc: values.rfc?.trim() || null, estado });
if (tallerError) {
  // Sin fila en talleres el usuario no sirve: lo borramos para poder reintentar.
  await sb.auth.admin.deleteUser(data.user.id);
  console.error("No se pudo registrar el taller:", tallerError.message);
  process.exit(1);
}

console.log(`Taller creado: ${nombre} <${email}> · estado: ${estado}`);
if (generada) console.log(`Contraseña inicial (no se volverá a mostrar): ${password}`);
