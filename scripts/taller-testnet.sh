#!/usr/bin/env bash
# Despliega el contrato qruta-taller en testnet, ligado a qruta-registry y a qruta-flota, y usa una vez cada una
# de sus 20 funciones: órdenes de trabajo con pago retenido, refacciones y mecánicos certificados.
#
# Uso (desde la raíz del repo):
#   bash scripts/taller-testnet.sh
#
# - El admin es la misma cuenta admin del registro (STELLAR_SECRET de .env.local, no se imprime).
# - Usa identidades locales de testnet (dos talleres, un socio y un mecánico) y una placa de prueba nueva.
# - Tarda unos 6 minutos: el paso de retraso espera a que venza un plazo de 1 minuto.
set -euo pipefail
cd "$(dirname "$0")/.."

RED=testnet
leer_env() { grep "^$1=" .env.local | cut -d= -f2-; }
REGISTRO="${REGISTRO:-$(leer_env QRUTA_CONTRACT_ID)}"
FLOTA="${FLOTA:-CDOVCMENU2RJAERXTZLYYGOLRHLBMUE6T3AUUT6NRLKNJFMFWUVFIGAI}"
if [[ -z "${STELLAR_ACCOUNT:-}" ]]; then
  ADMIN_SECRETO="$(leer_env STELLAR_SECRET)"
  # La CLI toma la cuenta fuente de esta variable: el secreto no aparece en la línea de comandos.
  export STELLAR_ACCOUNT="$ADMIN_SECRETO"
  unset ADMIN_SECRETO
fi
if [[ -z "$REGISTRO" || -z "$STELLAR_ACCOUNT" ]]; then
  echo "Faltan QRUTA_CONTRACT_ID o STELLAR_SECRET en .env.local" >&2
  exit 1
fi

XLM=10000000
huella() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
identidad() { stellar keys address "$1" >/dev/null 2>&1 || stellar keys generate "$1" --network "$RED" --fund >&2; stellar keys address "$1"; }
reg_admin() { stellar contract invoke --id "$REGISTRO" --network "$RED" --send=yes -- "$@"; }
reg_leer() { stellar contract invoke --id "$REGISTRO" --network "$RED" --send=no -- "$@"; }
reg_como() { local q="$1"; shift; stellar contract invoke --id "$REGISTRO" --network "$RED" --source-account "$q" --send=yes -- "$@"; }
flota_como() { local q="$1"; shift; stellar contract invoke --id "$FLOTA" --network "$RED" --source-account "$q" --send=yes -- "$@"; }

echo "== 1. Compilar y desplegar qruta-taller"
(cd contracts && cargo test -q -p qruta-taller && stellar contract build --package qruta-taller)
ADMIN="$(reg_leer admin | tr -d '"')"
XLM_SAC="$(stellar contract id asset --asset native --network "$RED")"
TALLER_ID="${TALLER_ID:-$(stellar contract deploy --wasm contracts/target/wasm32v1-none/release/qruta_taller.wasm --network "$RED" \
  -- --admin "$ADMIN" --registro "$REGISTRO" --flota "$FLOTA" --token "$XLM_SAC")}"
echo "Contrato qruta-taller: $TALLER_ID"
echo "  https://stellar.expert/explorer/$RED/contract/$TALLER_ID"

t_admin() { stellar contract invoke --id "$TALLER_ID" --network "$RED" --send=yes -- "$@"; }
t_leer() { stellar contract invoke --id "$TALLER_ID" --network "$RED" --send=no -- "$@"; }
t() { local q="$1"; shift; stellar contract invoke --id "$TALLER_ID" --network "$RED" --source-account "$q" --send=yes -- "$@"; }

echo "== 2. Identidades y unidad de prueba (registro y flota)"
T1="$(identidad qruta-taller-prueba)"
T2="$(identidad qruta-taller-prueba-2)"
SOCIO="$(identidad qruta-socio-1)"
MEC="$(identidad qruta-mecanico-1)"
reg_admin aprobar_taller --taller "$T1"
reg_admin aprobar_taller --taller "$T2"

AHORA="$(date +%s)"
SUF="${AHORA: -6}"
P="TA$SUF"
nuevo_expediente() {  # $1 = texto para la huella; imprime la huella registrada
  local hx; hx="$(huella "QRuta taller $P $1 $AHORA")"
  reg_como qruta-taller-prueba registrar --taller "$T1" --placa "$P" --hash "$hx" --tipo correctivo \
    --fecha "$(date +%s)" --vigente_hasta $(( $(date +%s) + 30 * 86400 )) >&2
  echo "$hx"
}
nuevo_expediente "inicial" >/dev/null
flota_como qruta-socio-1 registrar_socio --socio "$SOCIO" --huella_rfc "$(huella "RFC socio 1")" >/dev/null 2>&1 || true
flota_como qruta-socio-1 alta_unidad --socio "$SOCIO" --placa "$P"

D="$(huella "Cambio de balatas y rectificado $AHORA")"

echo "== 3. Orden 0: solicitar_cotizacion, cotizar, aceptar_cotizacion, iniciar_trabajo, entregar_trabajo, confirmar_entrega, calificar_orden"
t qruta-socio-1 solicitar_cotizacion --socio "$SOCIO" --placa "$P" --taller "$T1" --descripcion "$D"
t qruta-taller-prueba cotizar --taller "$T1" --id 0 --monto $((50 * XLM)) --plazo_min 120
t qruta-socio-1 aceptar_cotizacion --socio "$SOCIO" --id 0
t qruta-taller-prueba iniciar_trabajo --taller "$T1" --id 0
HA="$(nuevo_expediente "orden 0")"
t qruta-taller-prueba entregar_trabajo --taller "$T1" --id 0 --expediente "$HA"
t qruta-socio-1 confirmar_entrega --socio "$SOCIO" --id 0
t qruta-socio-1 calificar_orden --socio "$SOCIO" --id 0 --estrellas 5

echo "== 4. Orden 1: rechazar_cotizacion"
t qruta-socio-1 solicitar_cotizacion --socio "$SOCIO" --placa "$P" --taller "$T1" --descripcion "$D"
t qruta-taller-prueba cotizar --taller "$T1" --id 1 --monto $((90 * XLM)) --plazo_min 120
t qruta-socio-1 rechazar_cotizacion --socio "$SOCIO" --id 1

echo "== 5. Orden 2: cancelar_orden (devuelve lo pagado)"
t qruta-socio-1 solicitar_cotizacion --socio "$SOCIO" --placa "$P" --taller "$T1" --descripcion "$D"
t qruta-taller-prueba cotizar --taller "$T1" --id 2 --monto $((15 * XLM)) --plazo_min 120
t qruta-socio-1 aceptar_cotizacion --socio "$SOCIO" --id 2
t qruta-socio-1 cancelar_orden --socio "$SOCIO" --id 2

echo "== 6. Orden 3: disputar_orden y resolver_disputa (70% al taller)"
t qruta-socio-1 solicitar_cotizacion --socio "$SOCIO" --placa "$P" --taller "$T1" --descripcion "$D"
t qruta-taller-prueba cotizar --taller "$T1" --id 3 --monto $((20 * XLM)) --plazo_min 120
t qruta-socio-1 aceptar_cotizacion --socio "$SOCIO" --id 3
t qruta-taller-prueba iniciar_trabajo --taller "$T1" --id 3
HB="$(nuevo_expediente "orden 3")"
t qruta-taller-prueba entregar_trabajo --taller "$T1" --id 3 --expediente "$HB"
t qruta-socio-1 disputar_orden --socio "$SOCIO" --id 3 --evidencia "$(huella "Sigue rechinando $AHORA")"
t_admin resolver_disputa --id 3 --porcentaje_taller 70

echo "== 7. Orden 4: reclamar_por_retraso (plazo de 1 minuto)"
t qruta-socio-1 solicitar_cotizacion --socio "$SOCIO" --placa "$P" --taller "$T1" --descripcion "$D"
t qruta-taller-prueba cotizar --taller "$T1" --id 4 --monto $((10 * XLM)) --plazo_min 1
t qruta-socio-1 aceptar_cotizacion --socio "$SOCIO" --id 4
t qruta-taller-prueba iniciar_trabajo --taller "$T1" --id 4
echo "   esperando a que venza el plazo…"
sleep 75
t qruta-socio-1 reclamar_por_retraso --socio "$SOCIO" --id 4

echo "== 8. retirar_ganancias"
t qruta-taller-prueba retirar_ganancias --taller "$T1" --monto $((30 * XLM))

echo "== 9. Refacciones y mecánicos"
S1="$(huella "Serie balata BX-$AHORA-1")"
S2="$(huella "Serie balata BX-$AHORA-2")"
t qruta-taller-prueba registrar_pieza --taller "$T1" --serie "$S1" --tipo frenos
t qruta-taller-prueba registrar_pieza --taller "$T1" --serie "$S2" --tipo frenos
t qruta-taller-prueba alta_mecanico --taller "$T1" --mecanico "$MEC"
t_admin certificar_mecanico --mecanico "$MEC" --especialidad frenos --dias 180
t qruta-mecanico-1 instalar_pieza --mecanico "$MEC" --serie "$S1" --expediente "$HA"
t qruta-taller-prueba retirar_pieza --taller "$T1" --serie "$S1" --motivo "Balata defectuosa de fábrica"
t qruta-taller-prueba transferir_pieza --taller "$T1" --serie "$S2" --nuevo "$T2"
t qruta-taller-prueba baja_mecanico --taller "$T1" --mecanico "$MEC"

echo "== 10. Comprobación"
for i in 0 1 2 3 4; do t_leer orden --id "$i" | grep -o '"estado":[0-9]*' | sed "s/^/orden $i: /"; done
t_leer ganancias --taller "$T1"
t_leer retrasos --taller "$T1"
t_leer reputacion --taller "$T1"
t_leer pieza --serie "$S1"
t_leer pieza --serie "$S2"

echo
echo "Listo. Contrato qruta-taller: $TALLER_ID"
echo "  https://stellar.expert/explorer/$RED/contract/$TALLER_ID"
