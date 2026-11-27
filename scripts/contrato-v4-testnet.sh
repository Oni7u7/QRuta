#!/usr/bin/env bash
# Actualiza el contrato qruta-registry a v4 en testnet (conserva sus datos) y usa una vez cada función nueva:
# dar_de_baja, reactivar_unidad, apelar_anulacion y resolver_apelacion.
#
# Uso (desde la raíz del repo):
#   bash scripts/contrato-v4-testnet.sh
#
# - Firma la cuenta admin del contrato con STELLAR_SECRET de .env.local (no se imprime).
# - Usa la identidad local de testnet "qruta-taller-prueba" y solo placas de prueba (BAJA1, APEL1).
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

echo "== 1. Compilar y subir el código v4"
(cd contracts && cargo test -q && stellar contract build)
WASM_HASH="$(stellar contract upload --wasm contracts/target/wasm32v1-none/release/qruta_registry.wasm --network "$RED")"
echo "WASM: $WASM_HASH"

echo "== 2. Actualizar el contrato (mismo ID, mismos datos)"
como_admin actualizar --wasm_hash "$WASM_HASH"

echo "== 3. Taller de prueba"
stellar keys address qruta-taller-prueba >/dev/null 2>&1 || stellar keys generate qruta-taller-prueba --network "$RED" --fund
TALLER="$(stellar keys address qruta-taller-prueba)"
como_admin aprobar_taller --taller "$TALLER"

AHORA="$(date +%s)"
HASTA=$((AHORA + 90 * 86400))
HB="$(huella "QRuta v4 BAJA1 $AHORA")"
HA="$(huella "QRuta v4 APEL1 $AHORA")"

echo "== 4. dar_de_baja (el taller responsable retira la unidad)"
como_taller registrar --taller "$TALLER" --placa BAJA1 --hash "$HB" --tipo preventivo --fecha "$AHORA" --vigente_hasta "$HASTA"
como_taller dar_de_baja --quien "$TALLER" --placa BAJA1 --motivo "Unidad siniestrada"
leer estado --placa BAJA1

echo "== 5. reactivar_unidad (el admin la regresa a circulación)"
como_admin reactivar_unidad --placa BAJA1

echo "== 6. apelar_anulacion (el taller impugna una anulación)"
como_taller registrar --taller "$TALLER" --placa APEL1 --hash "$HA" --tipo preventivo --fecha "$AHORA" --vigente_hasta "$HASTA"
como_admin anular_expediente --hash "$HA" --motivo "Factura ilegible"
como_taller apelar_anulacion --taller "$TALLER" --hash "$HA" --motivo "Se adjunta factura legible"

echo "== 7. resolver_apelacion (el admin la acepta)"
como_admin resolver_apelacion --hash "$HA" --aceptar true

echo "== 8. Comprobación"
leer estado --placa BAJA1
leer baja --placa BAJA1
leer apelacion --hash "$HA"
leer estado --placa APEL1

echo
echo "Listo. Las transacciones están en:"
echo "  https://stellar.expert/explorer/$RED/contract/$CONTRATO"
