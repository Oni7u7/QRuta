-- QRuta: esquema completo para una base nueva.
-- (Si tu base se creó con una versión anterior, ejecuta en su lugar las migraciones de supabase/migrations/ que te falten.)
-- RLS activado y sin políticas: solo el servidor (service role) puede leer/escribir.

create table if not exists talleres (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rfc text,
  -- KYB manual: solo los talleres 'aprobado' pueden registrar servicios.
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','suspendido')),
  -- Wallet de Stellar (G...) con la que firma; la aprobación on-chain vive en el contrato.
  stellar_address text unique check (stellar_address ~ '^G[A-Z2-7]{55}$'),
  created_at timestamptz default now()
);

create table if not exists unidades (
  id bigint generated always as identity primary key,
  placa text unique not null,          -- normalizada: mayúsculas, solo A-Z0-9
  secreto text not null,               -- secreto TOTP base32
  created_at timestamptz default now()
);

create table if not exists expedientes (
  id bigint generated always as identity primary key,
  unidad_id bigint not null references unidades(id),
  taller_id uuid references talleres(id),
  tipo text not null check (tipo in ('preventivo','correctivo','verificacion')),
  fecha date not null,
  kilometraje integer check (kilometraje >= 0),
  checklist jsonb not null default '{}'::jsonb,
  notas text default '',
  firmado_por text not null,
  hash text not null,
  -- 1: hash de {placa,tipo,fecha,notas,firmado_por}
  -- 2: hash que además incluye kilometraje, checklist y taller_id
  hash_version smallint not null default 1,
  tx_hash text not null,
  -- memo: hash en el memo de una tx de QRuta · soroban: registrado en el contrato con la firma del taller
  anclaje text not null default 'memo' check (anclaje in ('memo','soroban')),
  firmado_con text check (firmado_con is null or firmado_con ~ '^G[A-Z2-7]{55}$'),
  vigente_hasta timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists expedientes_unidad_created_idx
  on expedientes (unidad_id, created_at desc);
create index if not exists expedientes_taller_created_idx
  on expedientes (taller_id, created_at desc);

alter table talleres enable row level security;
alter table unidades enable row level security;
alter table expedientes enable row level security;

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
