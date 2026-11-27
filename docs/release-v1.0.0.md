# QRuta v1.0.0 · Ship It

Primera versión publicada de QRuta: el expediente de mantenimiento verificable para el transporte público de la CDMX, con su huella en Stellar y un QR que cambia cada 15 segundos.

- App: https://qruta.vercel.app
- Video demo: https://youtu.be/xu2S-hPWIq4
- Contrato `qruta-registry` (testnet): [`CASN45DQAPXFABBKOFRJMFTWTTD6LP6AUSCXIOL3GVVPU6WSSRWLWCSH`](https://stellar.expert/explorer/testnet/contract/CASN45DQAPXFABBKOFRJMFTWTTD6LP6AUSCXIOL3GVVPU6WSSRWLWCSH)

## Qué incluye

### App (Next.js + Supabase)
- Alta de talleres con revisión del admin (KYB) e invitación por correo.
- Registro del servicio con checklist, firmado por el taller con Freighter. QRuta calcula la huella SHA-256 y comprueba que la transacción firmada sea exactamente la preparada.
- Pantalla de la unidad con un QR TOTP de 15 s, y verificación pública: vigente, por vencer o vencida, e integridad comparada con el contrato.
- Configuración por red (testnet o mainnet) con `NEXT_PUBLIC_STELLAR_NETWORK` y `STELLAR_RPC_URL`.
- 35 pruebas de la app con vitest.

### Contrato `qruta-registry` v0.5.0 (Soroban)
50 funciones públicas (contando las de lectura como `estado` y `expediente`) y 65 pruebas. Las que escriben:
- **Registro:** `registrar`, `registrar_lote`, `registrar_como_delegado`, `corregir_expediente`, `renovar`.
- **Control:** `anular_expediente`, `apelar_anulacion`, `resolver_apelacion`, `dar_de_baja`, `reactivar_unidad`.
- **Pasajeros:** `reportar_falla`, `retirar_reporte`, `atender_reporte`.
- **Talleres:** `aprobar_taller`, `suspender_taller`, `solicitar_alta`, `rechazar_solicitud`, `delegar_firma`, `revocar_delegado`, `cofirmar_expediente`, `transferir_unidad`.
- **Operación y autoridad:** `asignar_operador`, `registrar_kilometraje`, `programar_servicio`, `cancelar_cita`, `nombrar_autoridad`, `inspeccion_vial`, `prorrogar_vigencia`.
- **Gobierno:** `proponer_admin`, `aceptar_admin`, `actualizar`.

### Contrato `qruta-boveda` (reto exprés)
- Bóveda de 5555 XLM de testnet que se abre una sola vez con el código «Ship It», en [`/boveda`](https://qruta.vercel.app/boveda).

## Equipo
@Oni7u7 · @Alfa117
