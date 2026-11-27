#!/usr/bin/env bash
# Actualiza el contrato qruta-registry a v3 en testnet (conserva sus datos) y usa una vez cada función nueva:
# registrar_lote, reportar_falla, atender_reporte, cofirmar_expediente y transferir_unidad.
#
# Uso (desde la raíz del repo):
#   bash scripts/contrato-v3-testnet.sh
#
# - Firma la cuenta admin del contrato con STELLAR_SECRET de .env.local (no se imprime).
# - Usa identidades locales de testnet fondeadas con Friendbot: dos talleres de prueba y tres pasajeros.
#   Solo toca placas de prueba (LOTE…), no los expedientes reales.
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
como() { local quien="$1"; shift; stellar contract invoke --id "$CONTRATO" --network "$RED" --source-account "$quien" --send=yes -- "$@"; }
huella() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
identidad() { stellar keys address "$1" >/dev/null 2>&1 || stellar keys generate "$1" --network "$RED" --fund; stellar keys address "$1"; }

echo "== 1. Compilar y subir el código v3"
(cd contracts && cargo test -q && stellar contract build)
WASM_HASH="$(stellar contract upload --wasm contracts/target/wasm32v1-none/release/qruta_registry.wasm --network "$RED")"
echo "WASM: $WASM_HASH"

echo "== 2. Actualizar el contrato (mismo ID, mismos datos)"
como_admin actualizar --wasm_hash "$WASM_HASH"

echo "== 3. Talleres y pasajeros de prueba"
T1="$(identidad qruta-taller-prueba)"
T2="$(identidad qruta-taller-prueba-2)"
P1="$(identidad qruta-pasajero-1)"
P2="$(identidad qruta-pasajero-2)"
P3="$(identidad qruta-pasajero-3)"
como_admin aprobar_taller --taller "$T1"
como_admin aprobar_taller --taller "$T2"

AHORA="$(date +%s)"
HASTA=$((AHORA + 90 * 86400))
H1="$(huella "QRuta v3 LOTE1 $AHORA")"
H2="$(huella "QRuta v3 LOTE2 $AHORA")"
H3="$(huella "QRuta v3 LOTE1 atendido $AHORA")"
EV="$(huella "QRuta v3 evidencia frenos LOTE1 $AHORA")"

echo "== 4. registrar_lote (2 unidades en una transacción)"
como qruta-taller-prueba registrar_lote --taller "$T1" --lote "[
  {\"placa\":\"LOTE1\",\"hash\":\"$H1\",\"tipo\":\"preventivo\",\"fecha\":$AHORA,\"vigente_hasta\":$HASTA},
  {\"placa\":\"LOTE2\",\"hash\":\"$H2\",\"tipo\":\"preventivo\",\"fecha\":$AHORA,\"vigente_hasta\":$HASTA}
]"

echo "== 5. reportar_falla (3 pasajeros: la unidad queda en revisión)"
como qruta-pasajero-1 reportar_falla --reportante "$P1" --placa LOTE1 --evidencia "$EV"
como qruta-pasajero-2 reportar_falla --reportante "$P2" --placa LOTE1 --evidencia "$EV"
como qruta-pasajero-3 reportar_falla --reportante "$P3" --placa LOTE1 --evidencia "$EV"
leer revision --placa LOTE1

echo "== 6. atender_reporte (con un servicio nuevo del taller)"
como qruta-taller-prueba registrar --taller "$T1" --placa LOTE1 --hash "$H3" --tipo correctivo \
  --fecha "$AHORA" --vigente_hasta $((AHORA + 30 * 86400))
como qruta-taller-prueba atender_reporte --taller "$T1" --placa LOTE1 --hash "$H3"

echo "== 7. cofirmar_expediente (el segundo taller avala el servicio)"
como qruta-taller-prueba-2 cofirmar_expediente --inspector "$T2" --hash "$H3"

echo "== 8. transferir_unidad (LOTE2 pasa al segundo taller)"
como qruta-taller-prueba transferir_unidad --taller "$T1" --placa LOTE2 --nuevo "$T2"

echo "== 9. Comprobación"
leer revision --placa LOTE1
leer cofirma --hash "$H3"
leer custodio --placa LOTE2
leer estado --placa LOTE1

echo
echo "Listo. Las transacciones están en:"
echo "  https://stellar.expert/explorer/$RED/contract/$CONTRATO"
