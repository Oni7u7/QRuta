-- QRuta: esquema de base de datos.
-- RLS activado y sin políticas: solo el servidor (service role) puede leer/escribir.

create table if not exists unidades (
  id bigint generated always as identity primary key,
  placa text unique not null,          -- normalizada: mayúsculas, solo A-Z0-9
  secreto text not null,               -- secreto TOTP base32
  created_at timestamptz default now()
);

create table if not exists expedientes (
  id bigint generated always as identity primary key,
  unidad_id bigint not null references unidades(id),
  tipo text not null check (tipo in ('preventivo','correctivo','verificacion')),
  fecha date not null,
  notas text default '',
  firmado_por text not null,
  hash text not null,
  tx_hash text not null,
  vigente_hasta timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists expedientes_unidad_created_idx
  on expedientes (unidad_id, created_at desc);

alter table unidades enable row level security;
alter table expedientes enable row level security;
