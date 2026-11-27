#!/usr/bin/env bash
# Despliega el contrato qruta-flota en testnet, ligado al contrato qruta-registry, y usa una vez cada una
# de sus 20 funciones: socios y unidades, rutas y jornadas, fondo de mantenimiento, garantías,
# calificaciones y multas.
#
# Uso (desde la raíz del repo):
#   bash scripts/flota-testnet.sh
#
# - El admin de la flota es la misma cuenta admin del registro (STELLAR_SECRET de .env.local, no se imprime).
# - Usa identidades locales de testnet fondeadas con Friendbot (taller, operador y dos socios)
#   y placas de prueba nuevas en cada corrida.
set -euo pipefail
cd "$(dirname "$0")/.."

RED=testnet
leer_env() { grep "^$1=" .env.local | cut -d= -f2-; }
REGISTRO="${REGISTRO:-$(leer_env QRUTA_CONTRACT_ID)}"
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

echo "== 1. Compilar y desplegar qruta-flota"
(cd contracts && cargo test -q -p qruta-flota && stellar contract build --package qruta-flota)
ADMIN="$(reg_leer admin | tr -d '"')"
XLM_SAC="$(stellar contract id asset --asset native --network "$RED")"
FLOTA="${FLOTA:-$(stellar contract deploy --wasm contracts/target/wasm32v1-none/release/qruta_flota.wasm --network "$RED" \
  -- --admin "$ADMIN" --registro "$REGISTRO" --token "$XLM_SAC")}"
echo "Contrato qruta-flota: $FLOTA"
echo "  https://stellar.expert/explorer/$RED/contract/$FLOTA"

flota_admin() { stellar contract invoke --id "$FLOTA" --network "$RED" --send=yes -- "$@"; }
flota_leer() { stellar contract invoke --id "$FLOTA" --network "$RED" --send=no -- "$@"; }
flota() { local q="$1"; shift; stellar contract invoke --id "$FLOTA" --network "$RED" --source-account "$q" --send=yes -- "$@"; }

echo "== 2. Identidades y unidades de prueba en el registro"
TALLER="$(identidad qruta-taller-prueba)"
OPERADOR="$(identidad qruta-operador-2)"
SOCIO="$(identidad qruta-socio-1)"
SOCIO2="$(identidad qruta-socio-2)"
reg_admin aprobar_taller --taller "$TALLER"

AHORA="$(date +%s)"
SUF="${AHORA: -6}"
P1="FA$SUF"   # unidad que trabaja: ruta, jornada, pago, garantía y calificación
P2="FB$SUF"   # unidad que se multa, se vende y se da de baja
H1="$(huella "QRuta flota $P1 $AHORA")"
H2="$(huella "QRuta flota $P2 $AHORA")"
for par in "$P1 $H1" "$P2 $H2"; do
  set -- $par
  reg_como qruta-taller-prueba registrar --taller "$TALLER" --placa "$1" --hash "$2" --tipo preventivo \
    --fecha "$AHORA" --vigente_hasta $((AHORA + 90 * 86400))
done
reg_como qruta-taller-prueba asignar_operador --taller "$TALLER" --placa "$P1" --operador "$OPERADOR"

echo "== 3. registrar_socio y alta_unidad"
flota qruta-socio-1 registrar_socio --socio "$SOCIO" --huella_rfc "$(huella "RFC socio 1 $AHORA")"
flota qruta-socio-2 registrar_socio --socio "$SOCIO2" --huella_rfc "$(huella "RFC socio 2 $AHORA")"
flota qruta-socio-1 alta_unidad --socio "$SOCIO" --placa "$P1"
flota qruta-socio-1 alta_unidad --socio "$SOCIO" --placa "$P2"

echo "== 4. crear_ruta y asignar_ruta"
R="R$SUF"
flota_admin crear_ruta --codigo "$R" --nombre "Indios Verdes - Pantitlán"
flota qruta-socio-1 asignar_ruta --socio "$SOCIO" --placa "$P1" --ruta "$R"

echo "== 5. iniciar_jornada y terminar_jornada (dos jornadas: la segunda suma 180 km)"
flota qruta-operador-2 iniciar_jornada --operador "$OPERADOR" --placa "$P1"
flota qruta-operador-2 terminar_jornada --operador "$OPERADOR" --placa "$P1" --km 50000
flota qruta-operador-2 iniciar_jornada --operador "$OPERADOR" --placa "$P1"
flota qruta-operador-2 terminar_jornada --operador "$OPERADOR" --placa "$P1" --km 50180

echo "== 6. depositar_fondo, pagar_servicio y retirar_fondo"
flota qruta-socio-1 depositar_fondo --socio "$SOCIO" --monto $((100 * XLM))
flota qruta-socio-1 pagar_servicio --socio "$SOCIO" --hash "$H1" --monto $((60 * XLM))
flota qruta-socio-1 retirar_fondo --socio "$SOCIO" --monto $((10 * XLM))

echo "== 7. emitir_garantia, reclamar_garantia y resolver_garantia"
flota qruta-taller-prueba emitir_garantia --taller "$TALLER" --hash "$H1" --dias 30
flota qruta-socio-1 reclamar_garantia --socio "$SOCIO" --hash "$H1" --evidencia "$(huella "Frenos rechinan $AHORA")"
flota qruta-taller-prueba resolver_garantia --taller "$TALLER" --hash "$H1" --aceptada true

echo "== 8. calificar_taller"
flota qruta-socio-1 calificar_taller --socio "$SOCIO" --hash "$H1" --estrellas 5

echo "== 9. registrar_multa, pagar_multa y cancelar_multa"
flota_admin registrar_multa --placa "$P2" --monto $((5 * XLM)) --motivo "Exceso de pasaje"
flota qruta-socio-1 pagar_multa --socio "$SOCIO" --placa "$P2" --id 0
flota_admin registrar_multa --placa "$P2" --monto $((2 * XLM)) --motivo "Puerta abierta en marcha"
flota_admin cancelar_multa --placa "$P2" --id 1 --motivo "Multa duplicada"

echo "== 10. desasignar_ruta y cerrar_ruta"
flota qruta-socio-1 desasignar_ruta --socio "$SOCIO" --placa "$P1"
flota_admin cerrar_ruta --codigo "$R"

echo "== 11. transferir_propiedad y baja_unidad_flota"
flota qruta-socio-1 transferir_propiedad --socio "$SOCIO" --placa "$P2" --nuevo "$SOCIO2"
flota qruta-socio-2 baja_unidad_flota --socio "$SOCIO2" --placa "$P2" --motivo "Unidad vendida fuera de la ruta"

echo "== 12. Comprobación"
flota_leer totales --placa "$P1"
flota_leer fondo --socio "$SOCIO"
flota_leer garantia --hash "$H1"
flota_leer reputacion --taller "$TALLER"
flota_leer ruta --codigo "$R"
flota_leer dueno --placa "$P2"

echo
echo "Listo. Contrato qruta-flota: $FLOTA"
echo "  https://stellar.expert/explorer/$RED/contract/$FLOTA"
