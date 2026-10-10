-- Migración 002: talleres con KYB manual, checklist y kilometraje.
-- Ejecutar una sola vez en el SQL Editor sobre una base creada con la versión 1 de schema.sql.
-- Los expedientes existentes se conservan: quedan con taller_id nulo y hash_version 1.

create table if not exists talleres (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rfc text,
  -- KYB manual: solo los talleres 'aprobado' pueden registrar servicios.
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','suspendido')),
  created_at timestamptz default now()
);
alter table talleres enable row level security;

alter table expedientes
  add column if not exists taller_id uuid references talleres(id),
  add column if not exists kilometraje integer check (kilometraje >= 0),
  add column if not exists checklist jsonb not null default '{}'::jsonb,
  -- 1: hash de {placa,tipo,fecha,notas,firmado_por}
  -- 2: hash que además incluye kilometraje, checklist y taller_id
  add column if not exists hash_version smallint not null default 1;

create index if not exists expedientes_taller_created_idx
  on expedientes (taller_id, created_at desc);

