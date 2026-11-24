# Checklist del demo de QRuta

## Un día antes

- [ ] Producción actualizada (`vercel --prod`) con las 6 variables de entorno, incluida `QRUTA_CONTRACT_ID`.
- [ ] En Supabase, **Site URL** = `https://qruta.vercel.app` y el SMTP propio funcionando (manda una invitación de prueba).
- [ ] **Laptop del taller:** Freighter instalado, en **Testnet**, con la cuenta del taller de demo; esa cuenta ya conectó su wallet en `/taller` (activarla tarda ~25 s, mejor no hacerlo en vivo).
- [ ] **Sesiones abiertas:** el taller en una ventana normal y el admin en una de incógnito (o en otro navegador).
- [ ] **Datos listos:**
  - [ ] Una unidad **vigente** firmada con el contrato (por ejemplo, POP063).
  - [ ] Una unidad **vencida** (VEN001).
  - [ ] **Foto vieja del QR:** toma una captura de `/pantalla?p=PLACA` y guárdala en el celular.
  - [ ] Una **solicitud pendiente** en `/admin`, con un correo cuya bandeja puedas abrir en el demo.
- [ ] Saldo de prueba: la wallet del taller y la cuenta admin tienen XLM de testnet (si no, Friendbot).
- [ ] Celular con cámara y datos móviles como **respaldo de internet** (hotspot).

## 15 minutos antes

- [ ] Abre una vez `https://qruta.vercel.app/verificar` y `/pantalla?p=PLACA` para "despertar" las funciones de Vercel (la primera carga tarda ~2 s; después ~0.5 s).
- [ ] Ten abiertas en pestañas: `/pantalla?p=PLACA`, `/admin`, `/taller` y el contrato en Stellar Expert.
- [ ] Freighter desbloqueado.

## Guion (5 a 7 minutos)

1. **El problema (30 s).** Hoy el pasajero no puede saber si la unidad tuvo mantenimiento; las bitácoras de papel se pueden falsificar.
2. **Alta del taller (1 min).** En `/admin` abre la solicitud pendiente, muestra que el PDF y los datos coinciden y presiona **Aprobar y enviar invitación**. Muestra el correo que llega.
3. **Registro firmado (1.5 min).** En `/taller`, registra un servicio con el checklist (marca un componente en "Atención"). Presiona **Firmar y registrar**: Freighter pide la firma y la apruebas. Muestra el resultado y la transacción en Stellar Expert.
4. **Verificación con el celular (1 min).** Abre la pantalla de la unidad y escanea el QR: **Vigente**, checklist, "Firmado con su wallet · aprobada en el contrato" e **Integridad verificada en Stellar**.
5. **Foto vieja (30 s).** Escanea la captura vieja del QR: **Código expirado**.
6. **Unidad vencida (20 s).** Muestra VEN001: **Vencido**.
7. **Control del admin (opcional, 40 s).** Suspende al taller en `/admin`: ya no puede firmar, pero sus registros anteriores siguen válidos. Reactívalo.
8. **Cierre (30 s).** Roadmap: API pública, pantalla ESP32, firma con huella (Accesly), multi-firma, mainnet.

## Plan B

| Si falla… | Haz esto |
| --- | --- |
| Stellar tarda o no responde | Usa un registro ya hecho (POP063) y muestra su transacción en Stellar Expert. Explica que es la red de prueba. |
| Internet del lugar | Cambia al hotspot del celular. |
| No llega el correo | En la solicitud aprobada, **Generar enlace de acceso** y ábrelo en incógnito. |
| Freighter no abre | Recarga la página; revisa que esté en Testnet y con la cuenta del taller activa. |
| Error "Tu sesión no se pudo verificar" | Es la red: espera unos segundos e intenta de nuevo. |
| Testnet se reinició | Sigue la sección "Contrato" del README para volver a desplegar y aprobar wallets (toma ~15 min): mejor revisar el día anterior. |
| Todo lo demás | Ten un video corto grabado del flujo completo como respaldo. |
