#!/usr/bin/env bash
# Despliega el contrato qruta-seguro en testnet, ligado a qruta-registry y a qruta-flota, y usa una vez cada una
# de sus 20 funciones: pólizas, reserva, siniestros, controles y cierre.
#
# Uso (desde la raíz del repo):
#   bash scripts/seguro-testnet.sh
#
# - El admin es la misma cuenta admin del registro (STELLAR_SECRET de .env.local, no se imprime).
# - Usa identidades locales de testnet (taller y dos socios) y dos placas de prueba nuevas.
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

echo "== 1. Compilar y desplegar qruta-seguro"
(cd contracts && cargo test -q -p qruta-seguro && stellar contract build --package qruta-seguro)
ADMIN="$(reg_leer admin | tr -d '"')"
XLM_SAC="$(stellar contract id asset --asset native --network "$RED")"
SEGURO="${SEGURO:-$(stellar contract deploy --wasm contracts/target/wasm32v1-none/release/qruta_seguro.wasm --network "$RED" \
  -- --admin "$ADMIN" --registro "$REGISTRO" --flota "$FLOTA" --token "$XLM_SAC")}"
echo "Contrato qruta-seguro: $SEGURO"
echo "  https://stellar.expert/explorer/$RED/contract/$SEGURO"

s_admin() { stellar contract invoke --id "$SEGURO" --network "$RED" --send=yes -- "$@"; }
s_leer() { stellar contract invoke --id "$SEGURO" --network "$RED" --send=no -- "$@"; }
s() { local q="$1"; shift; stellar contract invoke --id "$SEGURO" --network "$RED" --source-account "$q" --send=yes -- "$@"; }

echo "== 2. Unidades de prueba (registro y flota)"
T1="$(identidad qruta-taller-prueba)"
SOCIO="$(identidad qruta-socio-1)"
SOCIO2="$(identidad qruta-socio-2)"
reg_admin aprobar_taller --taller "$T1"
flota_como qruta-socio-1 registrar_socio --socio "$SOCIO" --huella_rfc "$(huella "RFC socio 1")" >/dev/null 2>&1 || true
flota_como qruta-socio-2 registrar_socio --socio "$SOCIO2" --huella_rfc "$(huella "RFC socio 2")" >/dev/null 2>&1 || true
AHORA="$(date +%s)"
SUF="${AHORA: -6}"
S1="SA$SUF"
S2="SB$SUF"
H1="$(huella "QRuta seguro $S1 $AHORA")"
H2="$(huella "QRuta seguro $S2 $AHORA")"
for par in "$S1 $H1" "$S2 $H2"; do
  set -- $par
  reg_como qruta-taller-prueba registrar --taller "$T1" --placa "$1" --hash "$2" --tipo preventivo \
    --fecha "$AHORA" --vigente_hasta $((AHORA + 90 * 86400))
  flota_como qruta-socio-1 alta_unidad --socio "$SOCIO" --placa "$1"
done

echo "== 3. contratar_poliza, fondear_reserva, renovar_poliza y fijar_deducible"
s qruta-socio-1 contratar_poliza --socio "$SOCIO" --placa "$S1" --dias 100 --prima $((20 * XLM))
s_admin fondear_reserva --monto $((200 * XLM))
s qruta-socio-1 renovar_poliza --socio "$SOCIO" --placa "$S1" --dias 30 --prima $((5 * XLM))
s_admin fijar_deducible --placa "$S1" --monto $((5 * XLM))

echo "== 4. Siniestro 0: reportar_siniestro, evaluar_siniestro, anticipar_pago, pagar_siniestro y devolver_excedente"
s qruta-socio-1 reportar_siniestro --socio "$SOCIO" --placa "$S1" --monto $((100 * XLM)) --evidencia "$(huella "Choque lateral $AHORA")"
s_admin evaluar_siniestro --id 0 --aprobar true --monto $((80 * XLM))
s_admin anticipar_pago --id 0 --monto $((30 * XLM))
s_admin pagar_siniestro --id 0
s qruta-socio-1 devolver_excedente --socio "$SOCIO" --id 0 --monto $((10 * XLM))

echo "== 5. Siniestro 1: rechazado, apelar_siniestro y desistir_siniestro"
s qruta-socio-1 reportar_siniestro --socio "$SOCIO" --placa "$S1" --monto $((50 * XLM)) --evidencia "$(huella "Cristal roto $AHORA")"
s_admin evaluar_siniestro --id 1 --aprobar false --monto 0
s qruta-socio-1 apelar_siniestro --socio "$SOCIO" --id 1 --evidencia "$(huella "Factura del cristal $AHORA")"
s qruta-socio-1 desistir_siniestro --socio "$SOCIO" --id 1

echo "== 6. bonificar_buen_historial, suspender_poliza y reactivar_poliza"
s qruta-socio-1 contratar_poliza --socio "$SOCIO" --placa "$S2" --dias 30 --prima $((10 * XLM))
s_admin bonificar_buen_historial --placa "$S2"
s_admin suspender_poliza --placa "$S2" --motivo "Tarjeta de circulación vencida"
s_admin reactivar_poliza --placa "$S2"

echo "== 7. Siniestro 2: marcar_fraude y levantar_veto"
s qruta-socio-1 reportar_siniestro --socio "$SOCIO" --placa "$S2" --monto $((90 * XLM)) --evidencia "$(huella "Fotos dudosas $AHORA")"
s_admin marcar_fraude --id 2 --motivo "Las fotos son de otro accidente"
s_admin levantar_veto --socio "$SOCIO" --motivo "Aclarado con peritaje"

echo "== 8. transferir_poliza (la unidad se vende en la flota) y cancelar_poliza"
flota_como qruta-socio-1 transferir_propiedad --socio "$SOCIO" --placa "$S1" --nuevo "$SOCIO2"
s qruta-socio-2 transferir_poliza --nuevo "$SOCIO2" --placa "$S1"
s qruta-socio-2 cancelar_poliza --socio "$SOCIO2" --placa "$S1"

echo "== 9. vencer_poliza (la unidad pierde su servicio en el registro) y retirar_reserva"
reg_admin anular_expediente --hash "$H2" --motivo "Servicio de prueba anulado"
s qruta-socio-1 vencer_poliza --placa "$S2"
s_admin retirar_reserva --monto $((10 * XLM))

echo "== 10. Comprobación"
s_leer reserva
for i in 0 1 2; do s_leer siniestro --id "$i" | grep -o '"estado":[0-9]*' | sed "s/^/siniestro $i: /"; done
s_leer poliza --placa "$S1"
s_leer poliza --placa "$S2"

echo
echo "Listo. Contrato qruta-seguro: $SEGURO"
echo "  https://stellar.expert/explorer/$RED/contract/$SEGURO"
