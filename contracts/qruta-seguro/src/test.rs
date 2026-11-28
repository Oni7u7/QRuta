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

#[contracttype]
#[derive(Clone)]
enum ClaveMock {
    Vigente(String),
    Dueno(String),
}

#[contract]
pub struct MockRegistro;

#[contractimpl]
impl MockRegistro {
    pub fn estado(env: Env, placa: String) -> Option<EstadoUnidad> {
        let vigente: bool = env.storage().persistent().get(&ClaveMock::Vigente(placa.clone()))?;
        let registro = Registro {
            placa,
            taller: env.current_contract_address(),
            tipo: Symbol::new(&env, "preventivo"),
            fecha: AHORA,
            vigente_hasta: AHORA + 90 * DIA,
            ledger: 1,
        };
        Some(EstadoUnidad { hash: BytesN::from_array(&env, &[1; 32]), registro, vigente })
    }
    pub fn poner(env: Env, placa: String, vigente: bool) {
        env.storage().persistent().set(&ClaveMock::Vigente(placa), &vigente);
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
    socio: Address,
    placa: String,
    reg: MockRegistroClient<'a>,
    flota: MockFlotaClient<'a>,
    xlm: TokenClient<'a>,
    s: QrutaSeguroClient<'a>,
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
    let admin = Address::generate(&env);
    let socio = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let mint = StellarAssetClient::new(&env, &sac.address());
    mint.mint(&socio, &(1_000 * XLM));
    mint.mint(&admin, &(1_000 * XLM));
    let reg_id = env.register(MockRegistro, ());
    let flota_id = env.register(MockFlota, ());
    let reg = MockRegistroClient::new(&env, &reg_id);
    let flota = MockFlotaClient::new(&env, &flota_id);
    let placa = txt(&env, "ABC123");
    reg.poner(&placa, &true);
    flota.poner_dueno(&placa, &socio);
    let id = env.register(QrutaSeguro, (&admin, &reg_id, &flota_id, &sac.address()));
    let s = QrutaSeguroClient::new(&env, &id);
    let xlm = TokenClient::new(&env, &sac.address());
    Prueba { env, admin, socio, placa, reg, flota, xlm, s }
}

fn firmante(p: &Prueba) -> Address {
    p.env.auths()[0].0.clone()
}

/// Póliza de 100 días con prima de 20 XLM (cobertura 200 XLM) y reserva fondeada con 500 XLM.
fn con_poliza(p: &Prueba) {
    p.s.contratar_poliza(&p.socio, &p.placa, &100, &(20 * XLM));
    p.s.fondear_reserva(&(500 * XLM));
}

#[test]
fn contratar_exige_dueno_vigencia_y_una_poliza_activa() {
    let p = preparar();
    let extrano = Address::generate(&p.env);
    assert_eq!(p.s.try_contratar_poliza(&extrano, &p.placa, &100, &XLM), Err(Ok(Error::NoEsDueno)));
    assert_eq!(p.s.try_contratar_poliza(&p.socio, &p.placa, &29, &XLM), Err(Ok(Error::DatoInvalido)));
    assert_eq!(p.s.try_contratar_poliza(&p.socio, &p.placa, &100, &0), Err(Ok(Error::MontoInvalido)));
    p.reg.poner(&p.placa, &false);
    assert_eq!(p.s.try_contratar_poliza(&p.socio, &p.placa, &100, &XLM), Err(Ok(Error::UnidadNoVigente)));
    p.reg.poner(&p.placa, &true);

    assert_eq!(p.s.contratar_poliza(&p.socio, &p.placa, &100, &(20 * XLM)), AHORA + 100 * DIA);
    assert_eq!(firmante(&p), p.socio);
    assert_eq!(p.xlm.balance(&p.socio), 980 * XLM);
    assert_eq!(p.s.reserva(), (20 * XLM, 0));
    assert_eq!(p.s.try_contratar_poliza(&p.socio, &p.placa, &100, &XLM), Err(Ok(Error::PolizaActiva)));
}

#[test]
fn renovar_y_cancelar_con_reembolso_proporcional() {
    let p = preparar();
    p.s.contratar_poliza(&p.socio, &p.placa, &100, &(20 * XLM));
    assert_eq!(p.s.renovar_poliza(&p.socio, &p.placa, &100, &(20 * XLM)), AHORA + 200 * DIA);
    assert_eq!(p.s.poliza(&p.placa).unwrap().prima, 40 * XLM);
    // A la mitad de la vigencia se devuelve la mitad de la prima.
    p.env.ledger().set_timestamp(AHORA + 100 * DIA);
    assert_eq!(p.s.cancelar_poliza(&p.socio, &p.placa), 20 * XLM);
    assert_eq!(p.s.poliza(&p.placa), None);
    assert_eq!(p.s.try_renovar_poliza(&p.socio, &p.placa, &100, &XLM), Err(Ok(Error::SinPoliza)));
}

#[test]
fn siniestro_reportar_aprobar_y_pagar_con_deducible() {
    let p = preparar();
    con_poliza(&p);
    assert_eq!(p.s.try_reportar_siniestro(&p.socio, &p.placa, &(201 * XLM), &h(&p.env, 5)), Err(Ok(Error::ExcedeCobertura)));
    p.s.fijar_deducible(&p.placa, &(5 * XLM));
    let id = p.s.reportar_siniestro(&p.socio, &p.placa, &(100 * XLM), &h(&p.env, 5));
    assert_eq!(p.s.try_reportar_siniestro(&p.socio, &p.placa, &XLM, &h(&p.env, 6)), Err(Ok(Error::SiniestroAbierto)));
    assert_eq!(p.s.try_fijar_deducible(&p.placa, &XLM), Err(Ok(Error::SiniestroAbierto)));
    assert_eq!(p.s.try_cancelar_poliza(&p.socio, &p.placa), Err(Ok(Error::SiniestroAbierto)));

    assert_eq!(p.s.try_evaluar_siniestro(&id, &true, &(101 * XLM)), Err(Ok(Error::MontoInvalido)));
    p.s.evaluar_siniestro(&id, &true, &(80 * XLM));
    assert_eq!(firmante(&p), p.admin);
    assert_eq!(p.s.reserva().1, 80 * XLM);
    assert_eq!(p.s.anticipar_pago(&id, &(30 * XLM)), 30 * XLM);
    assert_eq!(p.s.try_anticipar_pago(&id, &(45 * XLM)), Err(Ok(Error::MontoInvalido)));
    // Paga lo aprobado menos el deducible y el anticipo: 80 - 5 - 30 = 45.
    assert_eq!(p.s.pagar_siniestro(&id), 45 * XLM);
    assert_eq!(p.xlm.balance(&p.socio), (980 + 75) * XLM);
    assert_eq!(p.s.reserva(), (520 * XLM - 75 * XLM, 0));
    assert_eq!(p.s.poliza(&p.placa).unwrap().siniestros_pagados, 1);
    assert_eq!(p.s.try_pagar_siniestro(&id), Err(Ok(Error::EstadoInvalido)));

    assert_eq!(p.s.try_devolver_excedente(&p.socio, &id, &(76 * XLM)), Err(Ok(Error::MontoInvalido)));
    assert_eq!(p.s.devolver_excedente(&p.socio, &id, &(10 * XLM)), 10 * XLM);
    assert_eq!(p.s.reserva().0, 455 * XLM);
}

#[test]
fn rechazo_apelacion_y_desistimiento() {
    let p = preparar();
    con_poliza(&p);
    let id = p.s.reportar_siniestro(&p.socio, &p.placa, &(50 * XLM), &h(&p.env, 5));
    p.s.evaluar_siniestro(&id, &false, &0);
    assert_eq!(p.s.siniestro(&id).unwrap().estado, SINIESTRO_RECHAZADO);
    assert_eq!(p.s.try_desistir_siniestro(&p.socio, &id), Err(Ok(Error::EstadoInvalido)));
    p.s.apelar_siniestro(&p.socio, &id, &h(&p.env, 6));
    assert_eq!(p.s.try_apelar_siniestro(&p.socio, &id, &h(&p.env, 7)), Err(Ok(Error::EstadoInvalido)));
    p.s.desistir_siniestro(&p.socio, &id);
    assert_eq!(p.s.siniestro(&id).unwrap().estado, SINIESTRO_DESISTIDO);
    assert!(!p.s.poliza(&p.placa).unwrap().siniestro_abierto);
    assert_eq!(p.s.try_evaluar_siniestro(&id, &true, &XLM), Err(Ok(Error::EstadoInvalido)));
}

#[test]
fn la_reserva_nunca_queda_bajo_lo_aprobado() {
    let p = preparar();
    p.s.contratar_poliza(&p.socio, &p.placa, &100, &(20 * XLM));
    let id = p.s.reportar_siniestro(&p.socio, &p.placa, &(100 * XLM), &h(&p.env, 5));
    assert_eq!(p.s.try_evaluar_siniestro(&id, &true, &(21 * XLM)), Err(Ok(Error::ReservaInsuficiente)));
    p.s.fondear_reserva(&(100 * XLM));
    p.s.evaluar_siniestro(&id, &true, &(100 * XLM));
    assert_eq!(p.s.try_retirar_reserva(&(21 * XLM)), Err(Ok(Error::ReservaInsuficiente)));
    assert_eq!(p.s.retirar_reserva(&(20 * XLM)), 100 * XLM);
    assert_eq!(p.s.try_retirar_reserva(&0), Err(Ok(Error::MontoInvalido)));
}

#[test]
fn bonificacion_por_buen_historial_una_vez() {
    let p = preparar();
    con_poliza(&p);
    assert_eq!(p.s.bonificar_buen_historial(&p.placa), 2 * XLM);
    assert_eq!(p.s.try_bonificar_buen_historial(&p.placa), Err(Ok(Error::YaBonificada)));

    let otra = txt(&p.env, "DEF456");
    p.reg.poner(&otra, &true);
    p.flota.poner_dueno(&otra, &p.socio);
    p.s.contratar_poliza(&p.socio, &otra, &100, &(10 * XLM));
    p.s.reportar_siniestro(&p.socio, &otra, &XLM, &h(&p.env, 5));
    assert_eq!(p.s.try_bonificar_buen_historial(&otra), Err(Ok(Error::ConSiniestros)));
}

#[test]
fn transferir_poliza_al_nuevo_dueno() {
    let p = preparar();
    con_poliza(&p);
    let nuevo = Address::generate(&p.env);
    assert_eq!(p.s.try_transferir_poliza(&nuevo, &p.placa), Err(Ok(Error::NoEsDueno)));
    assert_eq!(p.s.try_transferir_poliza(&p.socio, &p.placa), Err(Ok(Error::MismoDueno)));
    p.flota.poner_dueno(&p.placa, &nuevo);
    p.s.transferir_poliza(&nuevo, &p.placa);
    assert_eq!(firmante(&p), nuevo);
    assert_eq!(p.s.poliza(&p.placa).unwrap().socio, nuevo);
    assert_eq!(p.s.try_reportar_siniestro(&p.socio, &p.placa, &XLM, &h(&p.env, 5)), Err(Ok(Error::NoEsDueno)));
}

#[test]
fn suspender_y_reactivar_poliza() {
    let p = preparar();
    con_poliza(&p);
    assert_eq!(p.s.try_reactivar_poliza(&p.placa), Err(Ok(Error::NoSuspendida)));
    assert_eq!(p.s.try_suspender_poliza(&p.placa, &txt(&p.env, "x")), Err(Ok(Error::MotivoInvalido)));
    p.s.suspender_poliza(&p.placa, &txt(&p.env, "Documentos vencidos"));
    assert_eq!(p.s.try_suspender_poliza(&p.placa, &txt(&p.env, "Otra vez")), Err(Ok(Error::PolizaSuspendida)));
    assert_eq!(p.s.try_reportar_siniestro(&p.socio, &p.placa, &XLM, &h(&p.env, 5)), Err(Ok(Error::PolizaSuspendida)));
    p.reg.poner(&p.placa, &false);
    assert_eq!(p.s.try_reactivar_poliza(&p.placa), Err(Ok(Error::UnidadNoVigente)));
    p.reg.poner(&p.placa, &true);
    p.s.reactivar_poliza(&p.placa);
    p.s.reportar_siniestro(&p.socio, &p.placa, &XLM, &h(&p.env, 5));
}

#[test]
fn fraude_veta_al_dueno_hasta_levantar_el_veto() {
    let p = preparar();
    con_poliza(&p);
    let id = p.s.reportar_siniestro(&p.socio, &p.placa, &(150 * XLM), &h(&p.env, 5));
    p.s.marcar_fraude(&id, &txt(&p.env, "Fotos de otro accidente"));
    assert!(p.s.vetado(&p.socio));
    assert!(p.s.poliza(&p.placa).unwrap().suspendida);
    assert_eq!(p.s.siniestro(&id).unwrap().estado, SINIESTRO_FRAUDE);

    let otra = txt(&p.env, "DEF456");
    p.reg.poner(&otra, &true);
    p.flota.poner_dueno(&otra, &p.socio);
    assert_eq!(p.s.try_contratar_poliza(&p.socio, &otra, &100, &XLM), Err(Ok(Error::Vetado)));
    assert_eq!(p.s.try_levantar_veto(&Address::generate(&p.env), &txt(&p.env, "Aclarado")), Err(Ok(Error::NoVetado)));
    p.s.levantar_veto(&p.socio, &txt(&p.env, "Aclarado con peritaje"));
    p.s.contratar_poliza(&p.socio, &otra, &100, &XLM);
}

#[test]
fn vencer_poliza_solo_cuando_ya_vencio() {
    let p = preparar();
    con_poliza(&p);
    assert_eq!(p.s.try_vencer_poliza(&p.placa), Err(Ok(Error::PolizaVigente)));
    p.env.ledger().set_timestamp(AHORA + 101 * DIA);
    assert_eq!(p.s.try_reportar_siniestro(&p.socio, &p.placa, &XLM, &h(&p.env, 5)), Err(Ok(Error::PolizaVencida)));
    p.s.vencer_poliza(&p.placa);
    assert_eq!(p.s.poliza(&p.placa), None);
    assert_eq!(p.s.try_vencer_poliza(&p.placa), Err(Ok(Error::SinPoliza)));
    p.s.contratar_poliza(&p.socio, &p.placa, &30, &XLM);
}

#[test]
fn sin_mantenimiento_vigente_la_poliza_se_puede_cerrar() {
    let p = preparar();
    con_poliza(&p);
    p.reg.poner(&p.placa, &false);
    p.s.vencer_poliza(&p.placa);
    assert_eq!(p.s.poliza(&p.placa), None);
}

#[test]
fn sin_firmas_el_admin_no_mueve_la_reserva() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let reg_id = env.register(MockRegistro, ());
    let flota_id = env.register(MockFlota, ());
    let id = env.register(QrutaSeguro, (&admin, &reg_id, &flota_id, &sac.address()));
    let s = QrutaSeguroClient::new(&env, &id);
    assert!(s.try_retirar_reserva(&XLM).is_err());
    assert!(s.try_pagar_siniestro(&0).is_err());
    assert!(s.try_marcar_fraude(&0, &String::from_str(&env, "Prueba")).is_err());
}
