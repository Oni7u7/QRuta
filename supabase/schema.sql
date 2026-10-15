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
