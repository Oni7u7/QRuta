# QRuta

Expediente de mantenimiento verificable para unidades de transporte (microbús). Un **taller verificado** registra cada servicio con un checklist y lo **firma con su wallet de Stellar (Freighter)**; un **contrato inteligente (Soroban)** guarda la huella SHA-256 del expediente; la **pantalla de la unidad** muestra un QR que cambia cada 15 s y **cualquiera** lo escanea para ver si el mantenimiento está vigente. Una foto vieja del QR da "Código expirado".

- Producción: https://qruta.vercel.app
- Red: **Stellar testnet** (los registros son de demostración, sin validez legal)
- Contrato `qruta-registry`: `CASN45DQAPXFABBKOFRJMFTWTTD6LP6AUSCXIOL3GVVPU6WSSRWLWCSH` ([Stellar Expert](https://stellar.expert/explorer/testnet/contract/CASN45DQAPXFABBKOFRJMFTWTTD6LP6AUSCXIOL3GVVPU6WSSRWLWCSH))
- Checklist del demo: [`docs/DEMO.md`](docs/DEMO.md)
- **Video demo:** https://youtu.be/aZuqKICcNHA
- Versión actual: **v1.0.0** (contrato `qruta-registry` v0.5.0) · [notas de la versión](docs/release-v1.0.0.md)

## Cómo se usa

| Quién | Dónde | Qué hace |
|---|---|---|
| **Taller** | [`/registro-taller`](https://qruta.vercel.app/registro-taller) y luego [`/taller`](https://qruta.vercel.app/taller) | Pide su alta, conecta Freighter y registra cada servicio (placa, tipo, fecha, kilometraje, checklist); lo firma con su wallet |
| **Admin de QRuta** | [`/admin`](https://qruta.vercel.app/admin) | Revisa las solicitudes de alta, aprueba o suspende talleres en el contrato |
| **Unidad** | [`/pantalla?p=PLACA`](https://qruta.vercel.app/pantalla?p=REC345) | Muestra el QR que cambia cada 15 s |
| **Pasajero o inspector** | Escanea el QR (abre `/verificar`) | Ve al instante si el mantenimiento está vigente y si el expediente coincide con su huella en Stellar |

Prueba rápida sin cuenta: abre la [pantalla de la unidad REC345](https://qruta.vercel.app/pantalla?p=REC345) y escanea el QR con el celular.

## Cómo funciona

1. **Alta del taller (KYB):** el taller llena `/registro-taller` con sus datos y un PDF. Un admin lo revisa en `/admin` y lo aprueba; QRuta crea la cuenta y le envía una invitación por correo para elegir su contraseña.
2. **Wallet:** el taller conecta Freighter en `/taller`. Como su KYB ya está aprobado, QRuta aprueba esa wallet en el contrato en ese momento.
3. **Registro:** el taller captura placa, tipo, fecha, kilometraje, checklist y notas. QRuta calcula el hash y prepara la llamada `registrar` del contrato; el taller **la firma en Freighter**; QRuta comprueba que sea exactamente esa transacción y la envía. El contrato rechaza firmas de wallets no aprobadas.
4. **Verificación:** `/pantalla?p=PLACA` muestra el QR (token TOTP de 15 s). Al escanearlo, `/verificar` comprueba el token, recalcula el hash con los datos guardados y lo compara con el registro del contrato: **Integridad verificada en Stellar ✓**.

En la blockchain solo van el hash, la placa, el tipo, las fechas y la wallet que firmó. Las notas, el kilometraje y el detalle del checklist se quedan en Supabase. Nadie, ni QRuta, puede firmar por un taller: la llave vive en su Freighter.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres (con RLS y sin políticas; todo pasa por el servidor), Auth (correo y contraseña), Storage (PDF privados)
- Stellar testnet: contrato Soroban en Rust (`soroban-sdk` 29), `@stellar/stellar-sdk` 17, `@stellar/freighter-api` 6
- `otplib` (QR TOTP), `qrcode.react`, `zod`
- Despliegue: Vercel

## Estructura

```
app/                     páginas y rutas de la API
  admin/                 panel de administración (solicitudes y talleres)
  taller/                área del taller (registro firmado, historial por placa)
  registro-taller/       solicitud pública de alta
  verificar/, pantalla/  verificación pública y QR de la unidad
  auth/confirmar/, cuenta/contrasena/   alta por invitación
components/              componentes de interfaz
contracts/qruta-registry/  contrato Soroban (Rust) y sus pruebas
lib/                     lógica del servidor: contrato, hash, TOTP, Supabase, permisos
scripts/                 scripts de administración (crear admin/taller, KYB on-chain)
supabase/                schema.sql y migraciones
docs/                    documentación del equipo y checklist del demo
```

## Puesta en marcha local

### 1. Dependencias

```bash
npm install
```

### 2. Supabase

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En **SQL Editor** ejecuta `supabase/schema.sql` (base nueva). Si tu base viene de una versión anterior, ejecuta en orden las migraciones de `supabase/migrations/` que te falten (002, 003, 004).
3. En **Authentication**:
   - **Sign In / Providers:** desactiva *Allow new users to sign up* (las cuentas las crea QRuta).
   - **URL Configuration:** *Site URL* = tu URL pública (`https://qruta.vercel.app` en producción) y en *Redirect URLs* agrega `http://localhost:3000/**` y `https://qruta.vercel.app/**`.
   - **Emails → SMTP Settings:** configura un SMTP propio (por ejemplo, Gmail con contraseña de aplicación). Sin él, Supabase solo entrega correos a los miembros del equipo del proyecto y las invitaciones no llegan a los talleres. Aun sin SMTP, `/admin` ofrece un enlace de invitación para copiar.

### 3. Cuenta admin de Stellar

Crea una cuenta en testnet y fondéala con Friendbot (por ejemplo en [Stellar Lab](https://lab.stellar.org/account/create?$=network$id=testnet)). Su clave secreta (`S…`) es `STELLAR_SECRET`: será el **admin del contrato** (aprueba y suspende wallets de talleres). Guárdala en un gestor de contraseñas.

### 4. Contrato `qruta-registry`

Requiere Rust 1.91+, el target `wasm32v1-none` y la [Stellar CLI](https://developers.stellar.org/docs/tools/cli) 28.x (`cargo install --locked stellar-cli`).

```bash
cd contracts
cargo test                       # pruebas del contrato
stellar contract build           # genera target/wasm32v1-none/release/qruta_registry.wasm

# La llave se lee de .env.local; no queda en el historial de la terminal.
export STELLAR_ACCOUNT="$(grep '^STELLAR_SECRET=' ../.env.local | cut -d= -f2-)"
stellar contract deploy \
  --wasm target/wasm32v1-none/release/qruta_registry.wasm \
  --source-account "$STELLAR_ACCOUNT" --network testnet --alias qruta-registry \
  -- --admin <DIRECCION_PUBLICA_G_DE_TU_CUENTA_ADMIN>
unset STELLAR_ACCOUNT
```

El comando imprime el ID del contrato (`C…`): ese es `QRUTA_CONTRACT_ID`.

Funciones del contrato (v0.5):

| Función | Firma | Qué hace |
|---|---|---|
| `aprobar_taller` / `suspender_taller` | admin | KYB on-chain del taller |
| `registrar` | taller | Guarda la huella de un expediente y actualiza el estado de la placa |
| `registrar_lote` | taller | Hasta 10 expedientes en una transacción; si uno falla no se guarda ninguno |
| `corregir_expediente` | taller | Sustituye un expediente suyo y deja el anterior anulado con motivo |
| `anular_expediente` | admin | Anula un expediente (se conserva como evidencia) |
| `renovar` | cualquiera | Extiende el TTL de la placa hasta que vence su servicio |
| `reportar_falla` | pasajero | Un reporte por pasajero, placa y día; con 3 la unidad queda en revisión |
| `atender_reporte` | taller | Cierra la revisión con un servicio suyo posterior al primer reporte |
| `cofirmar_expediente` | otro taller | Aval de un segundo taller aprobado, una sola vez |
| `transferir_unidad` | taller responsable | Pasa la custodia de la placa a otro taller aprobado |
| `dar_de_baja` | admin o taller responsable | Retira la unidad: deja de estar vigente y no admite servicios, renovaciones ni reportes |
| `reactivar_unidad` | admin | Regresa a circulación una unidad dada de baja |
| `apelar_anulacion` | taller | Impugna, una sola vez, la anulación de un expediente suyo (no las de corrección) |
| `resolver_apelacion` | admin | Acepta (quita la anulación y recupera el estado de la placa) o rechaza la apelación |
| `solicitar_alta` / `rechazar_solicitud` | taller / admin | Solicitud de alta con la huella del RFC; una abierta a la vez |
| `delegar_firma` / `revocar_delegado` | taller | Autoriza a un empleado a firmar a su nombre (máximo 90 días) |
| `registrar_como_delegado` | empleado | Registra un servicio a nombre del taller con una delegación vigente |
| `asignar_operador` | taller responsable | Asigna el chofer de la unidad; un operador maneja una sola unidad |
| `registrar_kilometraje` | operador | El odómetro solo sube; con más de 10,000 km desde el servicio la unidad queda en revisión |
| `programar_servicio` / `cancelar_cita` | taller responsable | Una cita abierta, futura y hasta 30 días después de que vence el servicio |
| `nombrar_autoridad` | admin | Da de alta una cuenta de la autoridad de movilidad (no puede ser un taller) |
| `inspeccion_vial` | autoridad | Inspección en la vía pública; si se reprueba, la unidad queda en revisión |
| `prorrogar_vigencia` | autoridad | De 1 a 15 días, una vez por expediente y no sobre uno anulado |
| `retirar_reporte` | pasajero | Retira su reporte del ciclo abierto; puede sacar la unidad de revisión |
| `proponer_admin` / `aceptar_admin` | admin / nuevo admin | Cambio de admin en dos pasos |
| `estado`, `expediente`, `revision`, `cofirma`, `custodio`, `baja`, `apelacion`, `anulacion`, `correccion`, `solicitud`, `delegacion`, `operador`, `kilometraje`, `cita`, `es_autoridad`, `inspeccion`, `admin_propuesto` | lectura | Consultas gratuitas |

Para actualizar el contrato desplegado y probar en testnet las funciones de cada versión: `bash scripts/contrato-v3-testnet.sh`, `bash scripts/contrato-v4-testnet.sh` y `bash scripts/contrato-v5-testnet.sh`.

### Contrato `qruta-flota` (socios propietarios)

`CDOVCMENU2RJAERXTZLYYGOLRHLBMUE6T3AUUT6NRLKNJFMFWUVFIGAI` ([Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDOVCMENU2RJAERXTZLYYGOLRHLBMUE6T3AUUT6NRLKNJFMFWUVFIGAI)). Consulta al registro antes de actuar: una unidad vencida no entra a ruta, una unidad en revisión no arranca jornada y los pagos y garantías van al taller que firmó el expediente.

| Grupo | Funciones |
|---|---|
| Socios y unidades | `registrar_socio`, `alta_unidad`, `baja_unidad_flota`, `transferir_propiedad` |
| Rutas y jornadas | `crear_ruta`, `asignar_ruta`, `desasignar_ruta`, `cerrar_ruta`, `iniciar_jornada`, `terminar_jornada` |
| Fondo de mantenimiento (XLM) | `depositar_fondo`, `pagar_servicio`, `retirar_fondo` |
| Garantías | `emitir_garantia`, `reclamar_garantia`, `resolver_garantia` |
| Calificaciones y multas | `calificar_taller`, `registrar_multa`, `pagar_multa`, `cancelar_multa` |

Desplegarlo y usar cada función en testnet: `bash scripts/flota-testnet.sh`.

### 5. Variables de entorno

Copia `.env.example` a `.env.local` y complétalo:

| Variable | Qué es | ¿Secreta? |
| --- | --- | --- |
| `STELLAR_SECRET` | Clave `S…` de la cuenta admin del contrato | **Sí** |
| `SUPABASE_URL` | URL del proyecto Supabase | No |
| `SUPABASE_ANON_KEY` | Clave anon/publishable (sesiones de talleres y admins) | No (pero solo la usa el servidor) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role de Supabase | **Sí** |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Red de Stellar: `testnet` o `mainnet`. Vacía = `testnet`. Define Horizon, Soroban RPC, passphrase, Stellar Expert y la red que se exige en Freighter | No |
| `STELLAR_RPC_URL` | Soroban RPC propio. Opcional en testnet; **obligatorio en mainnet** (SDF no ofrece uno público) | Puede serlo si la URL incluye la llave del proveedor |
| `QRUTA_CONTRACT_ID` | ID `C…` del contrato `qruta-registry` en esa red | No |
| `NEXT_PUBLIC_BASE_URL` | URL pública de la app; va dentro del QR y de los enlaces de invitación | No |

Ninguna variable secreta lleva el prefijo `NEXT_PUBLIC_`. `.env.local` está en `.gitignore` y `.vercelignore`.

Para escanear el QR desde un celular en local, `NEXT_PUBLIC_BASE_URL` debe ser la IP de tu computadora en la red (`http://192.168.x.x:3000`) y hay que arrancar con `npm run dev -- -H 0.0.0.0`.

### 6. Primer administrador

```bash
node --env-file=.env.local scripts/crear-admin.mts --email admin@ejemplo.com --nombre "Nombre del admin"
```

Imprime una contraseña inicial una sola vez (o usa `--password '...'`). Con ella entras en `/login` y llegas a `/admin`.

### 7. Arrancar

```bash
npm run dev
```

Si un `next build` falla con errores raros de `.next` (por ejemplo `vendor-chunks`), detén el servidor de desarrollo y borra la caché: `rm -rf .next`. No corras `next build` mientras `next dev` está encendido: comparten la carpeta `.next`.

## Operación

### Alta de talleres (flujo normal, desde la web)

1. El taller envía su solicitud en `/registro-taller` (datos del negocio, RFC, teléfono, domicilio y un PDF de hasta 4 MB).
2. El admin la abre en `/admin`, compara los datos con el PDF y presiona **Aprobar y enviar invitación** (o **Rechazar** con un motivo).
3. El taller recibe el correo, elige su contraseña y entra a `/taller`. Si el correo no llega, en la solicitud aprobada está **Generar enlace de acceso** para compartirlo por otro medio.
4. El taller conecta Freighter (en **Testnet**); QRuta aprueba su wallet en el contrato y ya puede firmar.

### Suspender o reactivar un taller

En `/admin` → **Talleres** → **Suspender** / **Reactivar**. Se firma en el contrato y se actualiza la base. Un taller suspendido no puede firmar ni volver a activar su wallet; sus expedientes anteriores siguen siendo válidos.

### Scripts de respaldo (consola)

```bash
# Crear un taller sin pasar por la solicitud (imprime su contraseña una vez)
node --env-file=.env.local scripts/crear-taller.mts --email taller@ejemplo.com --nombre "Taller X" --rfc ABCD800101XY1

# Estado / aprobar / suspender la wallet de un taller en el contrato
node --env-file=.env.local scripts/taller-contrato.mts estado    --email taller@ejemplo.com
node --env-file=.env.local scripts/taller-contrato.mts aprobar   --email taller@ejemplo.com
node --env-file=.env.local scripts/taller-contrato.mts suspender --email taller@ejemplo.com
```

En zsh, no escribas los valores entre `< >`: son redirecciones de la terminal.

### Guía rápida de Freighter para talleres

1. Instala [Freighter](https://www.freighter.app/) en Chrome, Brave, Edge o Firefox (la firma se hace desde computadora).
2. Crea una cuenta y **guarda tu frase de recuperación** en un lugar seguro. Nadie puede recuperarla por ti, ni QRuta.
3. Cambia la red a **Testnet**.
4. En QRuta, `/taller` → **Conectar Freighter** (tarda unos 25 s la primera vez: se fondea y se activa la wallet).
5. Al registrar un servicio, Freighter te pedirá aprobar la transacción.

## Despliegue en Vercel (CLI)

```bash
npm i -g vercel
vercel login
vercel link                          # crea el proyecto la primera vez
vercel env add STELLAR_SECRET production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add QRUTA_CONTRACT_ID production
vercel env add NEXT_PUBLIC_BASE_URL production   # https://qruta.vercel.app (sin "/" al final)
vercel --prod
```

- Cada `vercel env add` pide el valor de forma interactiva (no lo pases con `echo`, queda en el historial).
- Después de cambiar `NEXT_PUBLIC_BASE_URL`, vuelve a desplegar: se incrusta en el build.
- En Supabase, la **Site URL** de producción debe ser `https://qruta.vercel.app` para que los enlaces del correo funcionen en cualquier dispositivo.
- Si la terminal no encuentra `vercel` tras instalarlo y usas zsh con HyDE (`ZDOTDIR=~/.config/zsh`), agrega `export PATH="$HOME/.npm-global/bin:$PATH"` en `~/.config/zsh/user.zsh`.

## Seguridad (resumen)

- Las llaves privadas de los talleres nunca llegan a QRuta: firman en Freighter. QRuta valida que la transacción firmada sea exactamente la que preparó antes de enviarla.
- `STELLAR_SECRET` y la service role solo existen en el servidor; ninguna llega al navegador (auditado).
- Tablas con RLS y sin políticas; los PDF del KYB están en un bucket privado y solo los ve un admin, servidos por QRuta.
- Cookies de sesión `httpOnly`, `secure` en producción y `SameSite=Lax`. Cabeceras de seguridad: `frame-ancestors 'self'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Formularios validados en el servidor con `zod`; la solicitud pública tiene límites por correo y por hora y un campo trampa contra bots.

## Limitaciones conocidas

- **Testnet:** se reinicia de vez en cuando; al pasar, hay que volver a desplegar el contrato, fondear cuentas y aprobar wallets.
- **`/api/pantalla/[placa]` es pública:** cualquiera que la llame obtiene el token vigente. Una foto vieja sí queda bloqueada; quitar esta ruta (QR generado por un ESP32 en la unidad) está en el roadmap.
- **Costo por registro en el contrato:** ~0.56 XLM (renta de almacenamiento por 120 días). Gratis en testnet; para mainnet convendría reducir el TTL o que QRuta patrocine la comisión.
- **Activar la wallet tarda ~25 s** (Friendbot + transacción del contrato).
- **El servidor firma las aprobaciones de wallets** con la cuenta admin; firmarlas desde el Freighter del admin está en el roadmap.
- Los expedientes anteriores al contrato (DEM001, ADB345, etc.) se siguen verificando por el memo de su transacción.

## Entregables antes del sábado 28 de noviembre de 2026

Mejoras de la página web (sin cambios al contrato). Para revisar lint, tipos y pruebas de una vez: `npm run verificar`.

| # | Mejora | Qué incluye | Estimado | Estado |
|---|---|---|---|---|
| 1 | **Pantalla vinculada a la unidad** | Un admin genera un código de emparejamiento por unidad; la pantalla lo usa una vez y recibe su credencial de dispositivo. `/api/pantalla/[placa]` solo entrega el token a dispositivos vinculados (cierra la limitación descrita arriba). En `/verificar`, la placa se muestra en grande con "Compárala con la placa de la unidad". Límite de solicitudes en `/api/pantalla` y `/verificar`. Requiere una migración nueva en Supabase. | ~2 días | Pendiente |
| 2 | **Doble factor para admins y bitácora** | Segundo factor al iniciar sesión como admin. Registro de quién aprobó, rechazó, suspendió o reactivó a qué taller y cuándo, visible en `/admin`. | ~1 día | Pendiente |
| 3 | **Avisos de vencimiento** | Correo cuando una unidad está a `DIAS_POR_VENCER` días o menos de vencer. Mientras no existan cuentas de concesionario, se envía al correo de contacto registrado para la unidad. | ~1 día | Pendiente |
| 4 | **Reportes del pasajero** | Desde `/verificar`: "esta unidad no tiene QR" o "sale vencida", con placa, motivo y comentario opcional. Los reportes se revisan en `/admin`. Con límite de solicitudes y campo trampa contra bots. | ~1 día | Pendiente |
| 5 | **Evidencias del servicio** | Fotos o factura adjuntas al expediente, en un bucket privado. Su hash entra en la huella del expediente que ya se ancla, sin cambiar el contrato. | ~1-2 días | Pendiente |
| 6 | **Pruebas automáticas de la app** | Pruebas dentro del repo para verificación, pantalla vinculada, registro y panel admin, que se corren con un solo comando. Se agregan a la par de cada mejora. | ~1-2 días | **En curso**: vitest, `npm test` y 33 pruebas de vigencias, QR, validación, huella y redes. Faltan las de cada mejora nueva. |
| 7 | **App multi-red** | Variable `NEXT_PUBLIC_STELLAR_NETWORK` (`testnet` \| `mainnet`; es pública porque Freighter la necesita en el navegador) que define en `lib/config.ts` las URLs de Horizon y Soroban RPC, la passphrase y los enlaces de Stellar Expert. Quita `Networks.TESTNET` del resto del código, hace que Freighter exija la red configurada, usa Friendbot solo en testnet y adapta los textos según la red. | ~1 día | **Hecho** (24 nov) |

Fuera de esta entrega: cuentas de concesionario, contrato v2, comisiones patrocinadas y corrección de expedientes. El detalle está en [`docs/roadmap-mainnet.md`](docs/roadmap-mainnet.md).

---

# Documentación del proyecto

# Funcionamiento del Frontend de QRuta

## 1. Objetivo

El frontend de QRuta es la capa de presentación e interacción de la plataforma. Su función es permitir que los diferentes usuarios registren servicios de mantenimiento, consulten expedientes digitales y verifiquen el estado de las unidades de transporte público mediante interfaces sencillas y accesibles.

El sistema contempla interfaces diferenciadas según las necesidades de los talleres mecánicos, socios propietarios, inspectores de SEMOVI y pasajeros.

## 2. Interfaces del sistema

### 2.1. Aplicación web del taller

Permite a los talleres autorizados registrar los servicios de mantenimiento de cada unidad. El formulario contempla información como identificación de la unidad, fecha, tipo de servicio, kilometraje y evidencias del mantenimiento realizado.

Una vez capturada la información, el sistema envía los datos al backend para validar la autorización del taller, procesar el registro y ejecutar las operaciones de firma digital y anclaje de la huella criptográfica en Stellar.

La interfaz está diseñada para facilitar el registro desde un dispositivo móvil, sin exigir que el taller gestione directamente llaves privadas, frases semilla o XLM.

### 2.2. Panel del socio propietario

Permite al socio propietario consultar el expediente digital de cada unidad, revisar el historial de mantenimiento y conocer el estado de vigencia de los servicios registrados.

También contempla la consulta de próximos vencimientos, la recepción de alertas y la exportación del expediente para presentarlo ante una aseguradora cuando sea necesario demostrar el mantenimiento de la unidad.

### 2.3. Página de verificación mediante QR

Es una página web accesible desde el navegador de cualquier teléfono celular, sin necesidad de instalar una aplicación ni crear una cuenta para realizar una consulta pública.

Cuando un inspector de SEMOVI o un pasajero escanea el código QR de una unidad, accede a una página que permite consultar el estado de verificación y la fecha del último mantenimiento, de acuerdo con los permisos y la información pública definida por la plataforma.

El backend comprueba la vigencia del código y recupera la información correspondiente antes de mostrar el resultado.

### 2.4. Pantalla de la unidad

La arquitectura contempla una pantalla instalada dentro de la unidad de transporte que muestra un código QR dinámico. Este código se renueva cada 10–15 segundos para reducir el riesgo de reutilización de fotografías antiguas.

La pantalla funciona como punto de acceso a la página de verificación. La autenticidad del código no depende únicamente de su renovación visual, sino también de los mecanismos de generación, vigencia y validación implementados en el backend.

## 3. Comunicación entre el frontend y el backend

El frontend se comunica con el backend mediante una API, que procesa las solicitudes y devuelve los resultados correspondientes.

El flujo general de una operación es el siguiente:

1. El usuario realiza una acción desde la interfaz.
2. El frontend verifica que los campos obligatorios estén completos y que los datos tengan el formato esperado.
3. La interfaz envía una solicitud al backend mediante la API.
4. El backend aplica las reglas de negocio, comprueba permisos y procesa la solicitud.
5. Cuando corresponde, el backend interactúa con la base de datos y con la red Stellar.
6. El backend devuelve el resultado de la operación.
7. El frontend presenta al usuario un mensaje de éxito, error o estado pendiente de confirmación.

La validación realizada en el frontend mejora la experiencia de uso, pero no sustituye las comprobaciones de seguridad que deben ejecutarse en el backend.

## 4. Principios de diseño

El frontend de QRuta se orienta por los siguientes principios:

* **Simplicidad:** reducir los pasos necesarios para registrar y consultar información.
* **Accesibilidad:** permitir el acceso desde navegadores web y dispositivos móviles.
* **Separación por roles:** ofrecer funciones de acuerdo con las responsabilidades de cada usuario.
* **Claridad:** comunicar los estados de los registros y las operaciones pendientes de forma comprensible.
* **Seguridad:** evitar la exposición de información sensible y de llaves privadas en el navegador.
* **Verificabilidad:** mostrar resultados respaldados por las validaciones realizadas en el backend.

## 5. Relación con la blockchain

El frontend no necesita interactuar directamente con Stellar para mostrar los expedientes o generar la interfaz de verificación. La comunicación con la blockchain se centraliza en el backend.

Cuando se registra un servicio, el backend procesa la información, calcula la huella digital correspondiente y solicita su anclaje en Stellar. Posteriormente, la plataforma puede consultar la evidencia para verificar la integridad del registro.

Esta separación permite que las interfaces sigan una lógica de funcionamiento independiente de los detalles internos de las transacciones blockchain.

## 6. Alcance del frontend en el MVP

El alcance propuesto contempla:

* Interfaz de registro de servicios para talleres autorizados.
* Panel del socio propietario para consultar expedientes.
* Página de verificación pública mediante QR.
* Visualización del código QR dinámico en la unidad.
* Consulta de estados y resultados devueltos por el backend.
* Acceso a la información necesaria para exportar el expediente.

Las funciones descritas corresponden al diseño propuesto para el MVP. Su disponibilidad efectiva debe comprobarse en el código y en las pruebas del repositorio.

## 7. Consideraciones de seguridad

El frontend no determina por sí solo la autenticidad de un servicio ni garantiza que una unidad tenga mantenimiento vigente. Estas conclusiones dependen de las validaciones del backend, la autorización del taller, la integridad del expediente y la verificación de la evidencia criptográfica correspondiente.

Asimismo, los registros cuyo anclaje todavía no haya sido confirmado en Stellar deben distinguirse de aquellos que ya cuentan con evidencia de confirmación.

El objetivo es ofrecer una interfaz sencilla para el usuario sin comprometer la confiabilidad de la información presentada.

# Decisiones Técnicas de QRuta

## 1. Objetivo

Este documento describe las decisiones técnicas propuestas para el desarrollo del MVP de QRuta y explica cómo contribuyen a resolver el problema de la falta de registros de mantenimiento verificables en el transporte público concesionado.

La arquitectura busca que los servicios registrados por talleres autorizados puedan consultarse y verificarse por propietarios, aseguradoras y autoridades, reduciendo la dependencia de documentos físicos y registros que pueden perderse o modificarse.

## 2. Arquitectura general

La arquitectura propuesta se divide en tres capas principales:

### 2.1. Capa de presentación: frontend

Contiene las interfaces web para talleres, socios propietarios, inspectores y pasajeros, así como la interfaz destinada a mostrar el código QR en la unidad.

Su responsabilidad es recibir las acciones del usuario, presentar información y comunicarse con el backend mediante una API.

### 2.2. Capa de lógica: backend y base de datos

El backend centraliza las reglas de negocio y coordina el registro de los servicios de mantenimiento.

Sus responsabilidades incluyen:

* Validar la autorización de los talleres.
* Procesar los datos de los servicios.
* Gestionar los expedientes digitales.
* Calcular las huellas criptográficas mediante SHA-256.
* Coordinar las operaciones de firma y anclaje.
* Generar y validar los códigos QR dinámicos.
* Consultar la red Stellar para comprobar las evidencias.
* Controlar los permisos de acceso a la información.
* Gestionar los estados de las operaciones y los registros pendientes de confirmación.

La base de datos conserva los expedientes completos y la información necesaria para el funcionamiento de la plataforma fuera de la blockchain.

### 2.3. Capa de integridad: Stellar

Stellar se utiliza para anclar las huellas criptográficas de los registros de mantenimiento mediante transacciones verificables.

La red permite consultar la evidencia del anclaje y comprobar si la huella de un expediente coincide con la que quedó registrada.

La blockchain no almacena necesariamente el expediente completo ni demuestra por sí sola que el mantenimiento haya ocurrido. Su función es proporcionar evidencia verificable de la huella registrada.

## 3. Justificación de las tecnologías

### 3.1. SHA-256

SHA-256 es una función criptográfica que permite calcular una huella digital a partir del contenido de un registro.

Si cambia algún dato incluido en el cálculo, como la fecha o el tipo de servicio, la huella resultante debe ser diferente.

Esta característica permite detectar alteraciones cuando se compara la huella recalculada con la que se ancló originalmente en Stellar.

Para que la comparación sea confiable, el sistema debe definir de manera consistente cómo se estructuran y serializan los datos que forman parte del registro.

### 3.2. Stellar

Se elige Stellar para proporcionar un registro compartido y verificable de las huellas criptográficas de los servicios de mantenimiento.

Su utilización responde a la necesidad de que diferentes actores, como talleres, propietarios y aseguradoras, puedan comprobar la integridad de los registros sin depender exclusivamente de la base de datos de una sola organización.

En el MVP se propone utilizar transacciones con datos asociados, mediante mecanismos como `manage_data` o un memo hash, según el diseño final de la transacción.

La implementación debe respetar los límites de tamaño, las reglas de la red y los requisitos de firma correspondientes al mecanismo seleccionado.

### 3.3. Base de datos externa a la blockchain

Los expedientes completos se almacenan fuera de Stellar para mantener la información operativa en una base de datos convencional.

Esta decisión permite conservar datos como kilometraje, tipo de mantenimiento, evidencias y referencias documentales sin publicar todo el contenido en una red pública.

La base de datos facilita las consultas de la aplicación, mientras que Stellar proporciona evidencia criptográfica para comprobar la integridad de los registros.

La solución requiere controles de acceso, respaldos y medidas de protección para evitar pérdidas o accesos no autorizados.

### 3.4. Backend y API

El backend centraliza las reglas de negocio y la comunicación con la base de datos y Stellar.

Esta decisión permite mantener las llaves privadas fuera del frontend, validar las solicitudes en un entorno controlado y evitar que la lógica crítica dependa exclusivamente del navegador del usuario.

La API permite que las distintas interfaces utilicen los mismos servicios de registro, consulta y verificación.

### 3.5. Vercel y Supabase

El Product Blueprint propone Vercel para el alojamiento de la aplicación y Supabase para la base de datos y los servicios asociados.

Estas herramientas se consideran para facilitar el desarrollo inicial y reducir los costos de infraestructura durante la validación del MVP.

Su configuración definitiva debe responder a los requisitos de seguridad, disponibilidad, escalabilidad y presupuesto del proyecto.

### 3.6. QR dinámico

Se propone un código QR que se renueva cada 10–15 segundos para reducir el riesgo de reutilización de fotografías antiguas.

El mecanismo debe incorporar una validación de vigencia y correspondencia con la unidad. El diseño puede utilizar tokens temporales y mecanismos criptográficos de autenticación.

La renovación periódica reduce determinados riesgos, pero no elimina por sí sola la posibilidad de retransmitir un código válido. Por ello, la validación debe realizarse en el backend.

### 3.7. Stellar Testnet

Se propone utilizar la red de pruebas de Stellar durante el desarrollo del MVP.

Esto permite probar la creación y consulta de transacciones antes de evaluar el despliegue en la red principal.

La transición a mainnet deberá considerar la gestión de fondos, la seguridad de las llaves, los costos operativos y las pruebas de funcionamiento.

### 3.8. No utilizar Soroban en la primera versión

El MVP no contempla inicialmente contratos inteligentes de Soroban, porque el objetivo prioritario es registrar huellas criptográficas y verificar su integridad.

Esta decisión busca mantener una arquitectura inicial sencilla y concentrar los esfuerzos en validar el flujo esencial del producto.

La incorporación de contratos inteligentes podrá evaluarse posteriormente si se requieren reglas automatizadas que justifiquen su complejidad adicional.

## 4. Decisiones de seguridad

### 4.1. Gestión de identidades y firmas

Cada taller autorizado debe estar asociado con una identidad verificable y con los mecanismos criptográficos definidos para firmar los registros.

La arquitectura debe distinguir entre la autenticación de un usuario en la aplicación y la firma digital que vincula un registro con una identidad criptográfica.

Las llaves privadas no deben exponerse en el frontend ni almacenarse en lugares inseguros.

La solución debe establecer cómo se generan, protegen, utilizan y revocan las llaves de los talleres.

### 4.2. Patrocinio de las transacciones

El proyecto propone que la plataforma absorba los costos de las operaciones en Stellar para que los talleres no tengan que gestionar XLM directamente.

La implementación deberá definir el mecanismo de patrocinio compatible con las operaciones utilizadas, así como las responsabilidades de firma y los controles sobre los recursos de la plataforma.

El patrocinio de los costos no elimina la necesidad de utilizar las firmas criptográficas requeridas por la red.

### 4.3. Verificación de integridad

La verificación debe recuperar el expediente correspondiente, recalcular la huella con el mismo procedimiento utilizado originalmente y compararla con la evidencia anclada.

Si las huellas no coinciden, el sistema debe identificar la discrepancia y evitar presentar el registro como íntegro.

### 4.4. Manejo de errores y confirmaciones

El sistema debe distinguir entre un registro capturado, un registro procesado y un registro cuyo anclaje ha sido confirmado en Stellar.

Si una operación falla o queda pendiente, la interfaz debe comunicarlo de forma clara. No debe presentarse como confirmado un anclaje que todavía no ha sido validado.

### 4.5. Protección de la información

La información completa del expediente se conserva fuera de la blockchain. Los accesos a dicha información deben controlarse mediante permisos y mecanismos de autenticación apropiados.

La información mostrada públicamente mediante el QR debe limitarse a los datos necesarios para la verificación y no debe exponer documentación sensible.

## 5. Flujo técnico de un registro

1. El taller autorizado captura los datos del servicio.
2. El backend verifica la autorización y valida la información.
3. El sistema prepara el contenido que formará parte del registro.
4. Se aplica el mecanismo de firma digital definido para vincular el registro con la identidad criptográfica correspondiente.
5. Se calcula la huella SHA-256 del contenido establecido.
6. El backend prepara y envía la transacción de anclaje a Stellar.
7. El sistema registra la referencia de la transacción y su estado de confirmación.
8. El expediente queda disponible para consulta según los permisos definidos.
9. Cuando se solicita una verificación, el sistema recalcula la huella y la compara con la evidencia anclada.

## 6. Alcance del MVP

El MVP prioriza las siguientes funciones:

* Registro de servicios por talleres autorizados.
* Firma de los registros según el mecanismo criptográfico definido.
* Anclaje de huellas SHA-256 en Stellar.
* Expediente digital de mantenimiento por unidad.
* Verificación mediante QR dinámico.
* Consulta de solo lectura para aseguradoras.
* Alertas básicas de vencimiento.
* Validación de la integridad de los registros.

Las funciones adicionales, como el registro de antidoping, las listas de inspección diaria, las órdenes de corrección y el tablero avanzado de flotillas, quedan fuera del alcance inicial definido en el Product Blueprint.

## 7. Limitaciones técnicas

El anclaje de una huella criptográfica permite comprobar si el contenido presentado coincide con el que se registró, pero no garantiza que los datos originales fueran verdaderos.

La confiabilidad del sistema depende también de la verificación de los talleres, la validez de las firmas, la calidad de las evidencias, la seguridad de la base de datos y la correcta implementación de los permisos.

La seguridad del QR depende de su diseño y validación, no únicamente de su renovación periódica.

La disponibilidad y el rendimiento deben comprobarse mediante pruebas antes de considerar validadas las métricas técnicas del proyecto.

## 8. Estado de implementación

Las tecnologías, componentes y mecanismos descritos en este documento representan las decisiones propuestas para la arquitectura del MVP.

Cada componente deberá verificarse contra el código, la configuración y las pruebas del repositorio para determinar si está implementado, en desarrollo o pendiente.

El objetivo de esta documentación es mantener trazabilidad entre el problema de negocio, las decisiones de ingeniería y las funcionalidades efectivamente entregadas.
