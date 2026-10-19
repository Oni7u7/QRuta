-- Migración 004: administradores, solicitudes de alta de talleres y documentos KYB.
-- Ejecutar una sola vez en el SQL Editor, después de la 003.
-- Igual que el resto: RLS activado y sin políticas; solo el servidor (service role) lee y escribe.

-- Administradores de QRuta (revisan solicitudes y aprueban talleres).
create table if not exists admins (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  created_at timestamptz default now()
);
alter table admins enable row level security;

-- Solicitudes de alta que llenan los talleres en /registro-taller.
create table if not exists solicitudes (
  id bigint generated always as identity primary key,
  nombre_comercial text not null check (char_length(nombre_comercial) between 2 and 120),
  -- RFC en mayúsculas: 3 letras (persona moral) o 4 (persona física), fecha AAMMDD y homoclave.
  rfc text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  responsable text not null check (char_length(responsable) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200),
  telefono text not null check (telefono ~ '^[0-9]{10}$'),
  domicilio text not null check (char_length(domicilio) between 5 and 300),
  -- Ruta del PDF dentro del bucket privado kyb-documentos.
  documento_path text not null,
  acepto_privacidad_at timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 500),
  revisada_por uuid references admins(id),
  revisada_at timestamptz,
  -- Taller creado al aprobar la solicitud.
  taller_id uuid references talleres(id),
  created_at timestamptz default now()
);
alter table solicitudes enable row level security;

-- Un mismo correo no puede tener dos solicitudes pendientes a la vez.
create unique index if not exists solicitudes_email_pendiente_idx
  on solicitudes (lower(email)) where estado = 'pendiente';
create index if not exists solicitudes_estado_created_idx
  on solicitudes (estado, created_at desc);

-- Bucket privado para los PDF del KYB (sin políticas: solo el servidor puede leerlos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyb-documentos', 'kyb-documentos', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
