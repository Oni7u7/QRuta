-- Migración 003: wallet del taller y anclaje en el contrato Soroban.
-- Ejecutar una sola vez en el SQL Editor, después de la 002.

-- Dirección pública de Stellar (G...) con la que firma el taller. La aprobación real vive en el contrato.
alter table talleres
  add column if not exists stellar_address text unique
    check (stellar_address ~ '^G[A-Z2-7]{55}$');

-- Cómo se ancló cada expediente:
--   memo    -> hash en el memo de una transacción de la cuenta de QRuta (expedientes anteriores)
--   soroban -> registrado en el contrato qruta-registry con la firma del taller
alter table expedientes
  add column if not exists anclaje text not null default 'memo'
    check (anclaje in ('memo', 'soroban')),
  -- Wallet que firmó el registro en el contrato (solo anclaje 'soroban').
  add column if not exists firmado_con text
    check (firmado_con is null or firmado_con ~ '^G[A-Z2-7]{55}$');
