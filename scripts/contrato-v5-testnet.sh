#!/usr/bin/env bash
# Actualiza el contrato qruta-registry a v5 en testnet (conserva sus datos) y usa una vez cada función nueva:
# solicitar_alta, rechazar_solicitud, delegar_firma, registrar_como_delegado, revocar_delegado,
# asignar_operador, registrar_kilometraje, programar_servicio, cancelar_cita, nombrar_autoridad,
# inspeccion_vial, prorrogar_vigencia, retirar_reporte, proponer_admin y aceptar_admin.
#
# Uso (desde la raíz del repo):
#   bash scripts/contrato-v5-testnet.sh
#
# - Firma la cuenta admin del contrato con STELLAR_SECRET de .env.local (no se imprime).
# - Usa identidades locales de testnet fondeadas con Friendbot y solo placas de prueba (FLOTA1).
# - El cambio de admin pasa a una cuenta temporal y regresa a la cuenta admin de siempre al final.
set -euo pipefail
cd "$(dirname "$0")/.."

RED=testnet
leer_env() { grep "^$1=" .env.local | cut -d= -f2-; }
CONTRATO="${CONTRATO:-$(leer_env QRUTA_CONTRACT_ID)}"
if [[ -z "${STELLAR_ACCOUNT:-}" ]]; then
  ADMIN_SECRETO="$(leer_env STELLAR_SECRET)"
  # La CLI toma la cuenta fuente de esta variable: el secreto no aparece en la línea de comandos.
  export STELLAR_ACCOUNT="$ADMIN_SECRETO"
  unset ADMIN_SECRETO
fi
if [[ -z "$CONTRATO" || -z "$STELLAR_ACCOUNT" ]]; then
  echo "Faltan QRUTA_CONTRACT_ID o STELLAR_SECRET en .env.local" >&2
  exit 1
fi

como_admin() { stellar contract invoke --id "$CONTRATO" --network "$RED" --send=yes -- "$@"; }
leer() { stellar contract invoke --id "$CONTRATO" --network "$RED" --send=no -- "$@"; }
como() { local quien="$1"; shift; stellar contract invoke --id "$CONTRATO" --network "$RED" --source-account "$quien" --send=yes -- "$@"; }
huella() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
identidad() { stellar keys address "$1" >/dev/null 2>&1 || stellar keys generate "$1" --network "$RED" --fund >&2; stellar keys address "$1"; }

if [[ "${SIN_ACTUALIZAR:-}" != 1 ]]; then
  echo "== 1. Compilar, subir el código v5 y actualizar el contrato (mismo ID, mismos datos)"
  (cd contracts && cargo test -q && stellar contract build)
  WASM_HASH="$(stellar contract upload --wasm contracts/target/wasm32v1-none/release/qruta_registry.wasm --network "$RED")"
  echo "WASM: $WASM_HASH"
  como_admin actualizar --wasm_hash "$WASM_HASH"
fi

echo "== 2. Identidades de prueba"
ADMIN="$(leer admin | tr -d '"')"
TALLER="$(identidad qruta-taller-prueba)"
NUEVO="$(identidad qruta-taller-nuevo)"
EMPLEADO="$(identidad qruta-empleado-1)"
OPERADOR="$(identidad qruta-operador-1)"
AUTORIDAD="$(identidad qruta-autoridad-1)"
PASAJERO="$(identidad qruta-pasajero-1)"
TEMPORAL="$(identidad qruta-admin-temporal)"
como_admin aprobar_taller --taller "$TALLER"

AHORA="$(date +%s)"
HASTA=$((AHORA + 90 * 86400))
HF="$(huella "QRuta v5 FLOTA1 $AHORA")"

echo "== 3. solicitar_alta y rechazar_solicitud"
como qruta-taller-nuevo solicitar_alta --taller "$NUEVO" --huella_rfc "$(huella "RFC de prueba $AHORA")"
como_admin rechazar_solicitud --taller "$NUEVO" --motivo "Falta comprobante de domicilio"

echo "== 4. delegar_firma, registrar_como_delegado y revocar_delegado"
como qruta-taller-prueba delegar_firma --taller "$TALLER" --empleado "$EMPLEADO" --hasta $((AHORA + 30 * 86400))
como qruta-empleado-1 registrar_como_delegado --empleado "$EMPLEADO" --taller "$TALLER" --placa FLOTA1 \
  --hash "$HF" --tipo preventivo --fecha "$AHORA" --vigente_hasta "$HASTA"
como qruta-taller-prueba revocar_delegado --taller "$TALLER" --empleado "$EMPLEADO"

echo "== 5. asignar_operador y registrar_kilometraje (pasa de 10,000 km: queda en revisión)"
como qruta-taller-prueba asignar_operador --taller "$TALLER" --placa FLOTA1 --operador "$OPERADOR"
como qruta-operador-1 registrar_kilometraje --operador "$OPERADOR" --placa FLOTA1 --km 50000
como qruta-operador-1 registrar_kilometraje --operador "$OPERADOR" --placa FLOTA1 --km 61000

echo "== 6. programar_servicio y cancelar_cita"
como qruta-taller-prueba programar_servicio --taller "$TALLER" --placa FLOTA1 --fecha $((AHORA + 7 * 86400))
como qruta-taller-prueba cancelar_cita --taller "$TALLER" --placa FLOTA1

echo "== 7. nombrar_autoridad, inspeccion_vial y prorrogar_vigencia"
como_admin nombrar_autoridad --cuenta "$AUTORIDAD"
como qruta-autoridad-1 inspeccion_vial --autoridad "$AUTORIDAD" --placa FLOTA1 --aprobada false \
  --evidencia "$(huella "Inspección FLOTA1 luces $AHORA")"
como qruta-autoridad-1 prorrogar_vigencia --autoridad "$AUTORIDAD" --hash "$HF" --dias 5

echo "== 8. retirar_reporte"
como qruta-pasajero-1 reportar_falla --reportante "$PASAJERO" --placa FLOTA1 --evidencia "$(huella "Reporte FLOTA1 $AHORA")"
como qruta-pasajero-1 retirar_reporte --reportante "$PASAJERO" --placa FLOTA1

echo "== 9. proponer_admin y aceptar_admin (a una cuenta temporal y de regreso)"
como_admin proponer_admin --nuevo "$TEMPORAL"
como qruta-admin-temporal aceptar_admin --nuevo "$TEMPORAL"
como qruta-admin-temporal proponer_admin --nuevo "$ADMIN"
como_admin aceptar_admin --nuevo "$ADMIN"

echo "== 10. Comprobación"
echo "admin: $(leer admin)  (debe ser $ADMIN)"
leer kilometraje --placa FLOTA1
leer revision --placa FLOTA1
leer inspeccion --placa FLOTA1
leer estado --placa FLOTA1

echo
echo "Listo. Las transacciones están en:"
echo "  https://stellar.expert/explorer/$RED/contract/$CONTRATO"
