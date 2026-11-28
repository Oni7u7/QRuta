#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Env,
};

const XLM: i128 = 10_000_000;
const AHORA: u64 = 1_795_000_000;

// ── Registro y flota simulados ──

#[contracttype]
#[derive(Clone)]
enum ClaveMock {
    Exp(BytesN<32>),
    Aprobado(Address),
    Dueno(String),
}

#[contract]
pub struct MockRegistro;

#[contractimpl]
impl MockRegistro {
    pub fn expediente(env: Env, hash: BytesN<32>) -> Option<Registro> {
        env.storage().persistent().get(&ClaveMock::Exp(hash))
    }
    pub fn es_aprobado(env: Env, taller: Address) -> bool {
        env.storage().persistent().get(&ClaveMock::Aprobado(taller)).unwrap_or(false)
    }
    pub fn poner_expediente(env: Env, hash: BytesN<32>, placa: String, taller: Address) {
        let reg = Registro {
            placa,
            taller,
            tipo: Symbol::new(&env, "correctivo"),
            fecha: AHORA,
            vigente_hasta: AHORA + 30 * DIA,
            ledger: env.ledger().sequence(),
        };
        env.storage().persistent().set(&ClaveMock::Exp(hash), &reg);
    }
    pub fn aprobar(env: Env, taller: Address, si: bool) {
        env.storage().persistent().set(&ClaveMock::Aprobado(taller), &si);
    }
}

#[contract]
pub struct MockFlota;

#[contractimpl]
impl MockFlota {
    pub fn dueno(env: Env, placa: String) -> Option<Address> {
        env.storage().persistent().get(&ClaveMock::Dueno(placa))
    }
    pub fn poner_dueno(env: Env, placa: String, socio: Address) {
        env.storage().persistent().set(&ClaveMock::Dueno(placa), &socio);
    }
}

struct Prueba<'a> {
    env: Env,
    admin: Address,
    taller: Address,
    socio: Address,
    placa: String,
    reg: MockRegistroClient<'a>,
    flota: MockFlotaClient<'a>,
    xlm: TokenClient<'a>,
    t: QrutaTallerClient<'a>,
}

fn txt(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

fn h(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn preparar() -> Prueba<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(AHORA);
    env.ledger().set_sequence_number(100);
    let admin = Address::generate(&env);
    let taller = Address::generate(&env);
    let socio = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    StellarAssetClient::new(&env, &sac.address()).mint(&socio, &(1_000 * XLM));
    let reg_id = env.register(MockRegistro, ());
    let flota_id = env.register(MockFlota, ());
    let reg = MockRegistroClient::new(&env, &reg_id);
    let flota = MockFlotaClient::new(&env, &flota_id);
    let placa = txt(&env, "ABC123");
    reg.aprobar(&taller, &true);
    flota.poner_dueno(&placa, &socio);
    let id = env.register(QrutaTaller, (&admin, &reg_id, &flota_id, &sac.address()));
    let t = QrutaTallerClient::new(&env, &id);
    let xlm = TokenClient::new(&env, &sac.address());
    Prueba { env, admin, taller, socio, placa, reg, flota, xlm, t }
}

fn firmante(p: &Prueba) -> Address {
    p.env.auths()[0].0.clone()
}

/// Orden cotizada por 50 XLM con plazo de 60 minutos.
fn cotizada(p: &Prueba) -> u32 {
    let id = p.t.solicitar_cotizacion(&p.socio, &p.placa, &p.taller, &h(&p.env, 10));
    p.t.cotizar(&p.taller, &id, &(50 * XLM), &60);
    id
}

/// Orden aceptada y en proceso.
fn en_proceso(p: &Prueba) -> u32 {
    let id = cotizada(p);
    p.t.aceptar_cotizacion(&p.socio, &id);
    p.t.iniciar_trabajo(&p.taller, &id);
    id
}

/// Orden entregada con un expediente nuevo del registro.
fn entregada(p: &Prueba, n: u8) -> u32 {
    let id = en_proceso(p);
    p.env.ledger().set_sequence_number(p.env.ledger().sequence() + 5);
    p.reg.poner_expediente(&h(&p.env, n), &p.placa, &p.taller);
    p.t.entregar_trabajo(&p.taller, &id, &h(&p.env, n));
    id
}

// ── Órdenes ──

#[test]
fn solicitar_cotizacion_exige_dueno_y_taller_aprobado() {
    let p = preparar();
    let extrano = Address::generate(&p.env);
    assert_eq!(p.t.try_solicitar_cotizacion(&extrano, &p.placa, &p.taller, &h(&p.env, 10)), Err(Ok(Error::NoEsDueno)));
    assert_eq!(p.t.try_solicitar_cotizacion(&p.socio, &p.placa, &p.socio, &h(&p.env, 10)), Err(Ok(Error::MismaCuenta)));
    assert_eq!(p.t.try_solicitar_cotizacion(&p.socio, &p.placa, &extrano, &h(&p.env, 10)), Err(Ok(Error::TallerNoAprobado)));
    assert_eq!(p.t.solicitar_cotizacion(&p.socio, &p.placa, &p.taller, &h(&p.env, 10)), 0);
    assert_eq!(firmante(&p), p.socio);
    assert_eq!(p.t.solicitar_cotizacion(&p.socio, &p.placa, &p.taller, &h(&p.env, 11)), 1);
}

#[test]
fn cotizar_valida_taller_monto_y_plazo() {
    let p = preparar();
    let id = p.t.solicitar_cotizacion(&p.socio, &p.placa, &p.taller, &h(&p.env, 10));
    let otro = Address::generate(&p.env);
    assert_eq!(p.t.try_cotizar(&otro, &id, &XLM, &60), Err(Ok(Error::NoEsDelTaller)));
    assert_eq!(p.t.try_cotizar(&p.taller, &id, &0, &60), Err(Ok(Error::MontoInvalido)));
    assert_eq!(p.t.try_cotizar(&p.taller, &id, &XLM, &0), Err(Ok(Error::PlazoInvalido)));
    assert_eq!(p.t.try_cotizar(&p.taller, &id, &XLM, &(PLAZO_MAXIMO_MIN + 1)), Err(Ok(Error::PlazoInvalido)));
    p.t.cotizar(&p.taller, &id, &(50 * XLM), &60);
    assert_eq!(firmante(&p), p.taller);
    assert_eq!(p.t.orden(&id).unwrap().estado, ORDEN_COTIZADA);
    assert_eq!(p.t.try_cotizar(&p.taller, &id, &XLM, &60), Err(Ok(Error::EstadoInvalido)));
    assert_eq!(p.t.try_cotizar(&p.taller, &99, &XLM, &60), Err(Ok(Error::OrdenNoExiste)));
}

#[test]
fn rechazar_cotizacion_solo_el_socio_y_cotizada() {
    let p = preparar();
    let id = cotizada(&p);
    assert_eq!(p.t.try_rechazar_cotizacion(&p.taller, &id), Err(Ok(Error::NoEsDelSocio)));
    p.t.rechazar_cotizacion(&p.socio, &id);
    assert_eq!(p.t.orden(&id).unwrap().estado, ORDEN_RECHAZADA);
    assert_eq!(p.t.try_aceptar_cotizacion(&p.socio, &id), Err(Ok(Error::EstadoInvalido)));
}

#[test]
fn aceptar_retiene_el_pago_y_exige_seguir_siendo_dueno() {
    let p = preparar();
    let id = cotizada(&p);
    p.t.aceptar_cotizacion(&p.socio, &id);
    assert_eq!(p.xlm.balance(&p.socio), 950 * XLM);
    assert_eq!(p.xlm.balance(&p.t.address), 50 * XLM);
    assert_eq!(p.t.orden(&id).unwrap().estado, ORDEN_ACEPTADA);

    // Si vendió la unidad, ya no puede aceptar otra orden de ella.
    let id2 = cotizada(&p);
    p.flota.poner_dueno(&p.placa, &Address::generate(&p.env));
    assert_eq!(p.t.try_aceptar_cotizacion(&p.socio, &id2), Err(Ok(Error::NoEsDueno)));
}

#[test]
fn iniciar_y_entregar_con_expediente_nuevo_del_registro() {
    let p = preparar();
    let viejo = h(&p.env, 20);
    p.reg.poner_expediente(&viejo, &p.placa, &p.taller);
    p.env.ledger().set_sequence_number(110);
    let id = cotizada(&p);
    assert_eq!(p.t.try_iniciar_trabajo(&p.taller, &id), Err(Ok(Error::EstadoInvalido)));
    p.t.aceptar_cotizacion(&p.socio, &id);
    assert_eq!(p.t.iniciar_trabajo(&p.taller, &id), AHORA + 3600);

    assert_eq!(p.t.try_entregar_trabajo(&p.taller, &id, &h(&p.env, 99)), Err(Ok(Error::ExpedienteNoExiste)));
    assert_eq!(p.t.try_entregar_trabajo(&p.taller, &id, &viejo), Err(Ok(Error::ServicioAnterior)));
    p.reg.poner_expediente(&h(&p.env, 21), &txt(&p.env, "OTRA1"), &p.taller);
    assert_eq!(p.t.try_entregar_trabajo(&p.taller, &id, &h(&p.env, 21)), Err(Ok(Error::ExpedienteDeOtraPlaca)));
    let otro = Address::generate(&p.env);
    p.reg.poner_expediente(&h(&p.env, 22), &p.placa, &otro);
    assert_eq!(p.t.try_entregar_trabajo(&p.taller, &id, &h(&p.env, 22)), Err(Ok(Error::NoEsDelTaller)));

    p.reg.poner_expediente(&h(&p.env, 23), &p.placa, &p.taller);
    p.t.entregar_trabajo(&p.taller, &id, &h(&p.env, 23));
    let o = p.t.orden(&id).unwrap();
    assert_eq!((o.estado, o.huella), (ORDEN_ENTREGADA, h(&p.env, 23)));
}

#[test]
fn confirmar_entrega_paga_al_taller_y_se_cobra() {
    let p = preparar();
    let id = entregada(&p, 30);
    assert_eq!(p.t.try_confirmar_entrega(&p.taller, &id), Err(Ok(Error::NoEsDelSocio)));
    p.t.confirmar_entrega(&p.socio, &id);
    assert_eq!(p.t.ganancias(&p.taller), 50 * XLM);
    assert_eq!(p.t.try_retirar_ganancias(&p.taller, &(51 * XLM)), Err(Ok(Error::SaldoInsuficiente)));
    assert_eq!(p.t.try_retirar_ganancias(&p.taller, &0), Err(Ok(Error::MontoInvalido)));
    assert_eq!(p.t.retirar_ganancias(&p.taller, &(20 * XLM)), 30 * XLM);
    assert_eq!(p.xlm.balance(&p.taller), 20 * XLM);
}

#[test]
fn disputa_y_resolucion_reparten_el_pago() {
    let p = preparar();
    let id = entregada(&p, 31);
    assert_eq!(p.t.try_resolver_disputa(&id, &50), Err(Ok(Error::EstadoInvalido)));
    p.t.disputar_orden(&p.socio, &id, &h(&p.env, 77));
    assert_eq!(p.t.try_confirmar_entrega(&p.socio, &id), Err(Ok(Error::EstadoInvalido)));
    assert_eq!(p.t.try_resolver_disputa(&id, &101), Err(Ok(Error::PorcentajeInvalido)));
    assert_eq!(p.t.resolver_disputa(&id, &70), 35 * XLM);
    assert_eq!(firmante(&p), p.admin);
    assert_eq!(p.t.ganancias(&p.taller), 35 * XLM);
    assert_eq!(p.xlm.balance(&p.socio), 965 * XLM);
    assert_eq!(p.t.orden(&id).unwrap().estado, ORDEN_RESUELTA);
}

#[test]
fn cancelar_devuelve_lo_pagado_solo_antes_de_empezar() {
    let p = preparar();
    let a = p.t.solicitar_cotizacion(&p.socio, &p.placa, &p.taller, &h(&p.env, 10));
    p.t.cancelar_orden(&p.socio, &a);
    assert_eq!(p.t.orden(&a).unwrap().estado, ORDEN_CANCELADA);

    let b = cotizada(&p);
    p.t.aceptar_cotizacion(&p.socio, &b);
    p.t.cancelar_orden(&p.socio, &b);
    assert_eq!(p.xlm.balance(&p.socio), 1_000 * XLM);

    let c = en_proceso(&p);
    assert_eq!(p.t.try_cancelar_orden(&p.socio, &c), Err(Ok(Error::EstadoInvalido)));
    assert_eq!(p.t.try_cancelar_orden(&p.taller, &c), Err(Ok(Error::NoEsDelSocio)));
}

#[test]
fn reclamar_por_retraso_solo_pasado_el_plazo() {
    let p = preparar();
    let id = en_proceso(&p);
    assert_eq!(p.t.try_reclamar_por_retraso(&p.socio, &id), Err(Ok(Error::SinRetraso)));
    p.env.ledger().set_timestamp(AHORA + 3601);
    p.t.reclamar_por_retraso(&p.socio, &id);
    assert_eq!(p.xlm.balance(&p.socio), 1_000 * XLM);
    assert_eq!(p.t.retrasos(&p.taller), 1);
    assert_eq!(p.t.orden(&id).unwrap().estado, ORDEN_REEMBOLSADA);
    assert_eq!(p.t.try_reclamar_por_retraso(&p.socio, &id), Err(Ok(Error::EstadoInvalido)));
}

#[test]
fn calificar_orden_terminada_una_vez() {
    let p = preparar();
    let id = entregada(&p, 32);
    assert_eq!(p.t.try_calificar_orden(&p.socio, &id, &5), Err(Ok(Error::EstadoInvalido)));
    p.t.confirmar_entrega(&p.socio, &id);
    assert_eq!(p.t.try_calificar_orden(&p.socio, &id, &6), Err(Ok(Error::DatoInvalido)));
    assert_eq!(p.t.calificar_orden(&p.socio, &id, &4), 400);
    assert_eq!(p.t.try_calificar_orden(&p.socio, &id, &5), Err(Ok(Error::YaCalificada)));

    let id2 = entregada(&p, 33);
    p.t.disputar_orden(&p.socio, &id2, &h(&p.env, 78));
    p.t.resolver_disputa(&id2, &0);
    assert_eq!(p.t.calificar_orden(&p.socio, &id2, &1), 250);
}

// ── Refacciones y mecánicos ──

fn mecanico_certificado(p: &Prueba, tipo: &str) -> Address {
    let m = Address::generate(&p.env);
    p.t.alta_mecanico(&p.taller, &m);
    p.t.certificar_mecanico(&m, &Symbol::new(&p.env, tipo), &30);
    m
}

#[test]
fn registrar_pieza_unica_y_de_taller_aprobado() {
    let p = preparar();
    let frenos = Symbol::new(&p.env, "frenos");
    let otro = Address::generate(&p.env);
    assert_eq!(p.t.try_registrar_pieza(&otro, &h(&p.env, 50), &frenos), Err(Ok(Error::TallerNoAprobado)));
    p.t.registrar_pieza(&p.taller, &h(&p.env, 50), &frenos);
    assert_eq!(firmante(&p), p.taller);
    assert_eq!(p.t.try_registrar_pieza(&p.taller, &h(&p.env, 50), &frenos), Err(Ok(Error::PiezaExiste)));
    assert_eq!(p.t.pieza(&h(&p.env, 50)).unwrap().estado, PIEZA_EN_INVENTARIO);
}

#[test]
fn instalar_pieza_exige_mecanico_certificado_en_el_tipo() {
    let p = preparar();
    let frenos = Symbol::new(&p.env, "frenos");
    p.t.registrar_pieza(&p.taller, &h(&p.env, 50), &frenos);
    p.reg.poner_expediente(&h(&p.env, 40), &p.placa, &p.taller);

    let sin_alta = Address::generate(&p.env);
    assert_eq!(p.t.try_instalar_pieza(&sin_alta, &h(&p.env, 50), &h(&p.env, 40)), Err(Ok(Error::NoEsMecanico)));
    let llantero = mecanico_certificado(&p, "llantas");
    assert_eq!(p.t.try_instalar_pieza(&llantero, &h(&p.env, 50), &h(&p.env, 40)), Err(Ok(Error::NoCertificado)));

    let m = mecanico_certificado(&p, "frenos");
    assert_eq!(p.t.try_instalar_pieza(&m, &h(&p.env, 99), &h(&p.env, 40)), Err(Ok(Error::PiezaNoExiste)));
    assert_eq!(p.t.try_instalar_pieza(&m, &h(&p.env, 50), &h(&p.env, 98)), Err(Ok(Error::ExpedienteNoExiste)));
    p.t.instalar_pieza(&m, &h(&p.env, 50), &h(&p.env, 40));
    assert_eq!(firmante(&p), m);
    let pieza = p.t.pieza(&h(&p.env, 50)).unwrap();
    assert_eq!((pieza.estado, pieza.placa), (PIEZA_INSTALADA, p.placa.clone()));
    assert_eq!(p.t.try_instalar_pieza(&m, &h(&p.env, 50), &h(&p.env, 40)), Err(Ok(Error::EstadoInvalido)));
}

#[test]
fn una_certificacion_vencida_no_sirve() {
    let p = preparar();
    let frenos = Symbol::new(&p.env, "frenos");
    p.t.registrar_pieza(&p.taller, &h(&p.env, 50), &frenos);
    p.reg.poner_expediente(&h(&p.env, 40), &p.placa, &p.taller);
    let m = mecanico_certificado(&p, "frenos");
    p.env.ledger().set_timestamp(AHORA + 31 * DIA);
    assert_eq!(p.t.try_instalar_pieza(&m, &h(&p.env, 50), &h(&p.env, 40)), Err(Ok(Error::NoCertificado)));
}

#[test]
fn retirar_y_transferir_piezas() {
    let p = preparar();
    let frenos = Symbol::new(&p.env, "frenos");
    p.t.registrar_pieza(&p.taller, &h(&p.env, 50), &frenos);
    p.t.registrar_pieza(&p.taller, &h(&p.env, 51), &frenos);
    p.reg.poner_expediente(&h(&p.env, 40), &p.placa, &p.taller);
    let m = mecanico_certificado(&p, "frenos");

    assert_eq!(p.t.try_retirar_pieza(&p.taller, &h(&p.env, 50), &txt(&p.env, "Falla")), Err(Ok(Error::EstadoInvalido)));
    p.t.instalar_pieza(&m, &h(&p.env, 50), &h(&p.env, 40));
    assert_eq!(p.t.try_retirar_pieza(&p.taller, &h(&p.env, 50), &txt(&p.env, "x")), Err(Ok(Error::MotivoInvalido)));
    p.t.retirar_pieza(&p.taller, &h(&p.env, 50), &txt(&p.env, "Balata desgastada"));
    assert_eq!(p.t.pieza(&h(&p.env, 50)).unwrap().estado, PIEZA_RETIRADA);

    let otro = Address::generate(&p.env);
    assert_eq!(p.t.try_transferir_pieza(&p.taller, &h(&p.env, 51), &otro), Err(Ok(Error::TallerNoAprobado)));
    assert_eq!(p.t.try_transferir_pieza(&p.taller, &h(&p.env, 51), &p.taller), Err(Ok(Error::MismaCuenta)));
    assert_eq!(p.t.try_transferir_pieza(&p.taller, &h(&p.env, 50), &otro), Err(Ok(Error::EstadoInvalido)));
    p.reg.aprobar(&otro, &true);
    p.t.transferir_pieza(&p.taller, &h(&p.env, 51), &otro);
    assert_eq!(p.t.pieza(&h(&p.env, 51)).unwrap().taller, otro);
    // El mecánico del taller anterior ya no la puede instalar.
    assert_eq!(p.t.try_instalar_pieza(&m, &h(&p.env, 51), &h(&p.env, 40)), Err(Ok(Error::NoEsDelTaller)));
}

#[test]
fn mecanicos_alta_certificacion_y_baja() {
    let p = preparar();
    let m = Address::generate(&p.env);
    let frenos = Symbol::new(&p.env, "frenos");
    assert_eq!(p.t.try_certificar_mecanico(&m, &frenos, &30), Err(Ok(Error::NoEsMecanico)));
    assert_eq!(p.t.try_alta_mecanico(&p.taller, &p.taller), Err(Ok(Error::MismaCuenta)));
    p.t.alta_mecanico(&p.taller, &m);
    assert_eq!(p.t.mecanico_de(&m), Some(p.taller.clone()));
    let otro = Address::generate(&p.env);
    p.reg.aprobar(&otro, &true);
    assert_eq!(p.t.try_alta_mecanico(&otro, &m), Err(Ok(Error::MecanicoOcupado)));

    assert_eq!(p.t.try_certificar_mecanico(&m, &frenos, &366), Err(Ok(Error::DatoInvalido)));
    assert_eq!(p.t.certificar_mecanico(&m, &frenos, &365), AHORA + 365 * DIA);
    assert_eq!(firmante(&p), p.admin);

    assert_eq!(p.t.try_baja_mecanico(&otro, &m), Err(Ok(Error::NoEsDelTaller)));
    p.t.baja_mecanico(&p.taller, &m);
    assert_eq!(p.t.mecanico_de(&m), None);
    assert_eq!(p.t.try_baja_mecanico(&p.taller, &m), Err(Ok(Error::NoEsMecanico)));
    // Ya puede entrar a otro taller.
    p.t.alta_mecanico(&otro, &m);
}

#[test]
fn sin_firmas_no_se_mueve_nada() {
    let env = Env::default();
    env.ledger().set_timestamp(AHORA);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let reg_id = env.register(MockRegistro, ());
    let flota_id = env.register(MockFlota, ());
    let id = env.register(QrutaTaller, (&admin, &reg_id, &flota_id, &sac.address()));
    let t = QrutaTallerClient::new(&env, &id);
    let m = Address::generate(&env);
    assert!(t.try_certificar_mecanico(&m, &Symbol::new(&env, "frenos"), &30).is_err());
    assert!(t.try_resolver_disputa(&0, &50).is_err());
    assert!(t.try_retirar_ganancias(&Address::generate(&env), &XLM).is_err());
    assert_eq!(t.admin(), admin);
}
