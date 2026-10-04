# QRuta

Expediente de mantenimiento verificable para unidades de transporte. Un taller registra un servicio, el hash SHA-256 del expediente se ancla en **Stellar testnet** y la pantalla de la unidad muestra un QR con un token TOTP que cambia cada 15 s. Cualquiera lo escanea y ve si el mantenimiento está vigente.

La API pública de verificación (`/api/v1/verificar`) es el producto; la web es un cliente más.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase (solo Postgres, acceso desde el servidor con service role)
- `@stellar/stellar-sdk`, `otplib`, `qrcode.react`, `zod`

## Desarrollo local

1. Instala dependencias:
   ```bash
   npm install
   ```
2. Crea un proyecto en [Supabase](https://supabase.com) y ejecuta `supabase/schema.sql` en el SQL Editor.
3. Crea una cuenta ancla en Stellar testnet (por ejemplo en el [Stellar Laboratory](https://lab.stellar.org/account/create?$=network$id=testnet)) y fondéala con Friendbot.
4. Copia `.env.example` a `.env.local` y completa los valores:

   | Variable | Descripción |
   | --- | --- |
   | `STELLAR_SECRET` | Clave secreta (`S…`) de la cuenta ancla en testnet |
   | `SUPABASE_URL` | URL del proyecto Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key (solo servidor, nunca con prefijo `NEXT_PUBLIC_`) |
   | `NEXT_PUBLIC_BASE_URL` | URL pública de la app; se usa para construir el enlace del QR |

5. Arranca:
   ```bash
   npm run dev
   ```

## Estructura

```
app/            páginas y route handlers
components/     componentes de UI compartidos
lib/            config, hash, TOTP, Stellar, Supabase, placas
supabase/       schema.sql
```

> Documentación de la API, deploy en Vercel y checklist del demo: pendientes en fases siguientes.
