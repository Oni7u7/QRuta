# QRuta: revisión y roadmap hacia mainnet

Revisión de solo lectura del contrato `qruta-registry` y de la app (noviembre 2026). No se cambió código.

## 1. Hallazgos de la revisión

### Contrato (`contracts/qruta-registry/src/lib.rs`)

| # | Severidad | Hallazgo | Por qué importa en mainnet |
|---|---|---|---|
| C1 | Alta | **Los datos pueden vencer antes que la vigencia.** El TTL se extiende a 120 días solo al escribir (`extender`, líneas 95-101). Un servicio de `verificacion` vale 180 días (`lib/config.ts`). | Si la placa no recibe otro servicio, su `Ultimo` y su `Expediente` se archivan hacia el día 120 y `estado()` deja de leerse mientras el servicio aún está vigente. |
| C2 | Alta | **La aprobación del taller también vence.** `Clave::Taller` solo se extiende en `aprobar_taller` / `suspender_taller`, no en `registrar`. | Unos 120 días después de aprobado, el taller ya no puede registrar hasta que alguien restaure la entrada. La app no maneja el *restore* de la simulación. |
| C3 | Alta | **El contrato confía en las fechas que manda el taller.** `registrar` solo valida `vigente_hasta > fecha`. No limita la vigencia por tipo ni impide fechas futuras. | Un taller aprobado que llame al contrato directamente (sin pasar por la app) puede dar 50 años de vigencia, o registrar `fecha` = año 2100 y bloquear que los servicios posteriores reemplacen al "último" de esa placa. |
| C4 | Media | **Una sola clave admin para todo.** La misma cuenta aprueba talleres y puede reemplazar el código (`actualizar`), y vive como `STELLAR_SECRET` en Vercel. | Si se filtra esa variable, alguien puede cambiar el contrato completo. |
| C5 | Info | Cualquier taller aprobado puede registrar cualquier placa. | Es una decisión de diseño válida para el MVP; en mainnet conviene decidirla a propósito (por ejemplo, ligar placas a un concesionario). |

Lo que está bien: `require_auth` del taller en cada registro, rechazo de expedientes duplicados, validación de placa y tipo, evento `ExpedienteRegistrado` y 11 pruebas del contrato.

### App: testnet fijado en el código

| Dónde | Qué |
|---|---|
| `lib/config.ts:47-63` | URL de Horizon, URL de Soroban RPC, passphrase y enlaces de Stellar Expert de testnet. |
| `lib/soroban.ts:94,139,160,220` | `Networks.TESTNET` en cada transacción. |
| `lib/soroban.ts:83` + `app/api/taller/wallet/route.ts:50` | Fondeo con Friendbot al vincular la wallet (en mainnet no existe). |
| `lib/freighter.ts:20-47` | Exige que Freighter esté en Testnet. |
| `app/api/expedientes/preparar/route.ts:31` | Devuelve `network: "TESTNET"`. |
| `scripts/taller-contrato.mts` | RPC, red y enlaces de testnet. |
| Textos | Footer, preguntas frecuentes de la landing, `/verificar`, `taller-form`, `wallet-panel`. |

### App: comisiones

- El taller es quien paga cada registro con su propia wallet; en testnet funciona porque Friendbot le regala XLM.
- En mainnet necesitaría comprar XLM. `lib/soroban.ts:161` hoy rechaza las transacciones *fee bump*, que son la forma estándar de que QRuta patrocine la comisión.

## 2. Roadmap

Tamaños aproximados: **S** días, **M** 1 a 2 semanas, **L** varias semanas. Dependen del equipo y de lo que pida la oportunidad.

### Fase 0. Definir el alcance (S)
- Qué pide la oportunidad (fondo, aceleradora o piloto) y sus hitos.
- Piloto concreto: una ruta o concesionario, cuántas unidades y qué talleres.
- Decidir el modelo de placas (C5) y quién paga las comisiones.

### Fase 1. Contrato v2 (M)
- **C1/C2:** subir el TTL por encima de la vigencia máxima más un margen; extender también `Taller` y la instancia en `registrar`; documentar cómo restaurar entradas.
- **C3:** vigencia máxima por tipo dentro del contrato y `fecha` no mayor al tiempo del ledger (con una tolerancia pequeña).
- **C4:** separar roles: `admin` (actualizar el contrato, en cuenta multifirma fuera de línea) y `operador` (aprobar y suspender talleres, la clave que usa el servidor).
- Pruebas nuevas para cada cambio, incluida la expiración de entradas.
- **Auditoría externa** del contrato. Hay programas del ecosistema Stellar que ayudan a cubrirla.

### Fase 2. App multi-red (M)
- Una variable `STELLAR_NETWORK` (`testnet` | `mainnet`) que defina URLs, passphrase y enlaces del explorador desde `lib/config.ts`; quitar `Networks.TESTNET` del resto del código.
- Freighter: exigir la red configurada, no "Testnet".
- Friendbot solo en testnet.
- **Comisiones patrocinadas:** cuenta patrocinadora de QRuta que envuelve la transacción firmada por el taller en un *fee bump*; con límite por taller y alerta de saldo bajo.
- Manejar el *restore* que pida la simulación (por si alguna entrada se archiva).
- Textos de testnet → textos según la red.
- Decidir si se retira el anclaje antiguo por memo (`lib/stellar.ts`); en mainnet todo empieza ya con el contrato.

### Fase 3. Producción y legal (M, en paralelo a la 2)
- Proyecto de Supabase de producción separado, con respaldos y revisión de políticas.
- Aviso de privacidad y términos de uso conforme a la LFPDPPP (datos de talleres y documentos KYB).
- Monitoreo: errores en Vercel, saldo de la cuenta patrocinadora y fallas de registro.
- Gestión de llaves: `STELLAR_SECRET` solo para el rol operador; procedimiento de rotación.

### Fase 4. Despliegue en mainnet (S)
- Desplegar el contrato v2 con el admin multifirma y fondear las cuentas operador y patrocinadora.
- Estimar el costo real por registro con simulaciones antes de abrir el piloto.
- Prueba de punta a punta en mainnet con una placa interna.
- Plan de reversa: cómo pausar registros y cómo actualizar el contrato si aparece un fallo.

### Fase 5. Piloto (L)
- Alta de los talleres del piloto (KYB + wallet), pantallas en las unidades y calcomanías.
- Medir: unidades verificadas, escaneos, servicios registrados y tiempo de registro por servicio.
- Recoger retroalimentación de talleres, concesionario y pasajeros.

### Después del piloto (roadmap de producto)
- API pública de verificación.
- Pantalla ESP32 que genera el QR con la API.
- Firma con huella / Face ID (passkeys) en lugar de extensión de navegador.
- Multi-firma taller + operador.
- Pago contra expediente en USDC.

## 3. Orden recomendado

1. Fase 0 primero: sin alcance claro no se sabe qué tanto de las demás pedirá la oportunidad.
2. Fase 1 antes que todo lo demás técnico: los hallazgos C1-C3 obligan a desplegar un contrato nuevo, y en mainnet conviene hacerlo una vez y bien.
3. Fases 2 y 3 en paralelo; la 4 cuando ambas estén listas y la auditoría cerrada.
