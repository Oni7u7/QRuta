#!/usr/bin/env bash
# Actualiza el contrato qruta-registry a v2 en testnet (conserva sus datos) y usa una vez cada función nueva:
# corregir_expediente, anular_expediente y renovar.
#
# Uso (desde la raíz del repo):
#   bash scripts/contrato-v2-testnet.sh
#
# - Firma la cuenta admin del contrato con STELLAR_SECRET de .env.local (no se imprime).
# - Crea en testnet una identidad local "qruta-taller-prueba" (fondeada con Friendbot) para registrar
#   placas de prueba (PRUEBA1, PRUEBA2). No toca los expedientes reales.
set -euo pipefail
cd "$(dirname "$0")/.."

RED=testnet
leer_env() { grep "^$1=" .env.local | cut -d= -f2-; }
CONTRATO="$(leer_env QRUTA_CONTRACT_ID)"
ADMIN_SECRETO="$(leer_env STELLAR_SECRET)"
if [[ -z "$CONTRATO" || -z "$ADMIN_SECRETO" ]]; then
  echo "Faltan QRUTA_CONTRACT_ID o STELLAR_SECRET en .env.local" >&2
  exit 1
fi
# La CLI toma la cuenta fuente de esta variable: el secreto no aparece en la línea de comandos.
export STELLAR_ACCOUNT="$ADMIN_SECRETO"
unset ADMIN_SECRETO

como_admin() { stellar contract invoke --id "$CONTRATO" --network "$RED" --send=yes -- "$@"; }
leer() { stellar contract invoke --id "$CONTRATO" --network "$RED" --send=no -- "$@"; }
como_taller() { stellar contract invoke --id "$CONTRATO" --network "$RED" --source-account qruta-taller-prueba --send=yes -- "$@"; }
huella() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

echo "== 1. Compilar y subir el código v2"
(cd contracts && cargo test -q && stellar contract build)
WASM_HASH="$(stellar contract upload --wasm contracts/target/wasm32v1-none/release/qruta_registry.wasm --network "$RED")"
echo "WASM: $WASM_HASH"

echo "== 2. Actualizar el contrato (mismo ID, mismos datos)"
como_admin actualizar --wasm_hash "$WASM_HASH"

echo "== 3. Taller de prueba"
stellar keys address qruta-taller-prueba >/dev/null 2>&1 || stellar keys generate qruta-taller-prueba --network "$RED" --fund
TALLER="$(stellar keys address qruta-taller-prueba)"
echo "Taller de prueba: $TALLER"
como_admin aprobar_taller --taller "$TALLER"

AHORA="$(date +%s)"
HASTA=$((AHORA + 30 * 86400))
H1="$(huella "QRuta v2 PRUEBA1 original $AHORA")"
H2="$(huella "QRuta v2 PRUEBA1 corregido $AHORA")"
H3="$(huella "QRuta v2 PRUEBA2 $AHORA")"

echo "== 4. corregir_expediente"
como_taller registrar --taller "$TALLER" --placa PRUEBA1 --hash "$H1" --tipo correctivo --fecha "$AHORA" --vigente_hasta "$HASTA"
como_taller corregir_expediente --taller "$TALLER" --anterior "$H1" --hash "$H2" --tipo correctivo \
  --fecha "$AHORA" --vigente_hasta "$HASTA" --motivo "Kilometraje mal capturado"

echo "== 5. anular_expediente"
como_taller registrar --taller "$TALLER" --placa PRUEBA2 --hash "$H3" --tipo correctivo --fecha "$AHORA" --vigente_hasta "$HASTA"
como_admin anular_expediente --hash "$H3" --motivo "Servicio de prueba anulado"

echo "== 6. renovar"
como_admin renovar --placa PRUEBA1

echo "== 7. Comprobación"
leer estado --placa PRUEBA1
leer correccion --hash "$H1"
leer anulacion --hash "$H3"

echo
echo "Listo. Las transacciones están en:"
echo "  https://stellar.expert/explorer/$RED/contract/$CONTRATO"
