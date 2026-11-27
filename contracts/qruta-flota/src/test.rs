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

// ── Registro simulado: responde como qruta-registry ──

#[contracttype]
#[derive(Clone)]
enum ClaveMock {
    Estado(String),
    Exp(BytesN<32>),
    Aprobado(Address),
    Revision(String),
    Operador(String),
}

#[contract]
pub struct MockRegistro;

#[contractimpl]
impl MockRegistro {
    pub fn estado(env: Env, placa: String) -> Option<EstadoUnidad> {
        env.storage().persistent().get(&ClaveMock::Estado(placa))
    }
    pub fn expediente(env: Env, hash: BytesN<32>) -> Option<Registro> {
        env.storage().persistent().get(&ClaveMock::Exp(hash))
    }
    pub fn es_aprobado(env: Env, taller: Address) -> bool {
        env.storage().persistent().get(&ClaveMock::Aprobado(taller)).unwrap_or(false)
    }
    pub fn revision(env: Env, placa: String) -> Option<Revision> {
        env.storage().persistent().get(&ClaveMock::Revision(placa))
    }
    pub fn operador(env: Env, placa: String) -> Option<Address> {
        env.storage().persistent().get(&ClaveMock::Operador(placa))
    }

    // Preparación de las pruebas.
    pub fn poner_expediente(env: Env, hash: BytesN<32>, placa: String, taller: Address, vigente: bool) {
        let reg = Registro {
            placa: placa.clone(),
            taller,
            tipo: Symbol::new(&env, "preventivo"),
            fecha: AHORA - DIA,
            vigente_hasta: AHORA + 89 * DIA,
            ledger: 1,
        };
        env.storage().persistent().set(&ClaveMock::Exp(hash.clone()), &reg);
        env.storage().persistent().set(&ClaveMock::Estado(placa), &EstadoUnidad { hash, registro: reg, vigente });
    }
    pub fn aprobar(env: Env, taller: Address, si: bool) {
        env.storage().persistent().set(&ClaveMock::Aprobado(taller), &si);
    }
    pub fn poner_operador(env: Env, placa: String, operador: Address) {
        env.storage().persistent().set(&ClaveMock::Operador(placa), &operador);
    }
    pub fn poner_revision(env: Env, placa: String, en_revision: bool) {
        let r = Revision { reportes: 3, en_revision, desde_ledger: 1, ultima_evidencia: BytesN::from_array(&env, &[0; 32]) };
        env.storage().persistent().set(&ClaveMock::Revision(placa), &r);
    }
}

struct Prueba<'a> {
    env: Env,
    admin: Address,
    taller: Address,
    socio: Address,
    reg: MockRegistroClient<'a>,
    xlm: TokenClient<'a>,
    flota: QrutaFlotaClient<'a>,
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
    let taller = Address::generate(&env);
    let socio = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    StellarAssetClient::new(&env, &sac.address()).mint(&socio, &(1_000 * XLM));
    let reg_id = env.register(MockRegistro, ());
    let reg = MockRegistroClient::new(&env, &reg_id);
    reg.aprobar(&taller, &true);
    reg.poner_expediente(&h(&env, 1), &txt(&env, "ABC123"), &taller, &true);
    let id = env.register(QrutaFlota, (&admin, &reg_id, &sac.address()));
    let flota = QrutaFlotaClient::new(&env, &id);
    let xlm = TokenClient::new(&env, &sac.address());
    Prueba { env, admin, taller, socio, reg, xlm, flota }
}

/// Socio registrado con la unidad ABC123 en su flota.
fn con_unidad(p: &Prueba) -> String {
    p.flota.registrar_socio(&p.socio, &h(&p.env, 90));
    let pl = txt(&p.env, "ABC123");
    p.flota.alta_unidad(&p.socio, &pl);
    pl
}

fn firmante(p: &Prueba) -> Address {
    p.env.auths()[0].0.clone()
}

// ── Socios y unidades ──

#[test]
fn registrar_socio_una_vez_y_sin_ser_taller() {
    let p = preparar();
    p.flota.registrar_socio(&p.socio, &h(&p.env, 90));
    assert_eq!(firmante(&p), p.socio);
    assert_eq!(p.flota.socio(&p.socio).unwrap().unidades, 0);
    assert_eq!(p.flota.try_registrar_socio(&p.socio, &h(&p.env, 90)), Err(Ok(Error::YaRegistrado)));
    assert_eq!(p.flota.try_registrar_socio(&p.taller, &h(&p.env, 91)), Err(Ok(Error::EsTaller)));
}

#[test]
fn alta_unidad_exige_socio_registro_y_que_no_tenga_dueno() {
    let p = preparar();
    let pl = txt(&p.env, "ABC123");
    assert_eq!(p.flota.try_alta_unidad(&p.socio, &pl), Err(Ok(Error::NoEsSocio)));
    p.flota.registrar_socio(&p.socio, &h(&p.env, 90));
    assert_eq!(p.flota.try_alta_unidad(&p.socio, &txt(&p.env, "ZZZ999")), Err(Ok(Error::PlacaSinRegistro)));
    assert_eq!(p.flota.alta_unidad(&p.socio, &pl), 1);
    assert_eq!(p.flota.dueno(&pl), Some(p.socio.clone()));

    let otro = Address::generate(&p.env);
    p.flota.registrar_socio(&otro, &h(&p.env, 91));
    assert_eq!(p.flota.try_alta_unidad(&otro, &pl), Err(Ok(Error::UnidadConDueno)));
}

#[test]
fn baja_unidad_solo_sin_ruta_jornada_ni_multas() {
    let p = preparar();
    let pl = con_unidad(&p);
    let ruta = txt(&p.env, "R1");
    p.flota.crear_ruta(&ruta, &txt(&p.env, "Indios Verdes - Pantitlán"));
    p.flota.asignar_ruta(&p.socio, &pl, &ruta);
    assert_eq!(p.flota.try_baja_unidad_flota(&p.socio, &pl, &txt(&p.env, "Vendida")), Err(Ok(Error::TieneRuta)));
    p.flota.desasignar_ruta(&p.socio, &pl);

    p.flota.registrar_multa(&pl, &(5 * XLM), &txt(&p.env, "Exceso de pasaje"));
    assert_eq!(p.flota.try_baja_unidad_flota(&p.socio, &pl, &txt(&p.env, "Vendida")), Err(Ok(Error::MultasPendientes)));
    p.flota.pagar_multa(&p.socio, &pl, &0);

    let op = Address::generate(&p.env);
    p.reg.poner_operador(&pl, &op);
    p.flota.iniciar_jornada(&op, &pl);
    assert_eq!(p.flota.try_baja_unidad_flota(&p.socio, &pl, &txt(&p.env, "Vendida")), Err(Ok(Error::JornadaAbierta)));
    p.flota.terminar_jornada(&op, &pl, &1000);

    assert_eq!(p.flota.try_baja_unidad_flota(&p.socio, &pl, &txt(&p.env, "x")), Err(Ok(Error::MotivoInvalido)));
    let extrano = Address::generate(&p.env);
    assert_eq!(p.flota.try_baja_unidad_flota(&extrano, &pl, &txt(&p.env, "Vendida")), Err(Ok(Error::NoEsDueno)));
    p.flota.baja_unidad_flota(&p.socio, &pl, &txt(&p.env, "Unidad vendida"));
    assert_eq!(p.flota.dueno(&pl), None);
    assert_eq!(p.flota.socio(&p.socio).unwrap().unidades, 0);
}

#[test]
fn transferir_propiedad_reglas() {
    let p = preparar();
    let pl = con_unidad(&p);
    let nuevo = Address::generate(&p.env);
    assert_eq!(p.flota.try_transferir_propiedad(&p.socio, &pl, &nuevo), Err(Ok(Error::NoEsSocio)));
    p.flota.registrar_socio(&nuevo, &h(&p.env, 91));
    assert_eq!(p.flota.try_transferir_propiedad(&p.socio, &pl, &p.socio), Err(Ok(Error::MismoSocio)));
    p.flota.registrar_multa(&pl, &XLM, &txt(&p.env, "Placa ilegible"));
    assert_eq!(p.flota.try_transferir_propiedad(&p.socio, &pl, &nuevo), Err(Ok(Error::MultasPendientes)));
    p.flota.cancelar_multa(&pl, &0, &txt(&p.env, "Multa duplicada"));

    p.flota.transferir_propiedad(&p.socio, &pl, &nuevo);
    assert_eq!(firmante(&p), p.socio);
    assert_eq!(p.flota.dueno(&pl), Some(nuevo.clone()));
    assert_eq!(p.flota.socio(&p.socio).unwrap().unidades, 0);
    assert_eq!(p.flota.socio(&nuevo).unwrap().unidades, 1);
    assert_eq!(p.flota.try_transferir_propiedad(&p.socio, &pl, &nuevo), Err(Ok(Error::NoEsDueno)));
}

// ── Rutas y jornadas ──

#[test]
fn rutas_crear_asignar_mover_y_cerrar() {
    let p = preparar();
    let pl = con_unidad(&p);
    let r1 = txt(&p.env, "R1");
    let r2 = txt(&p.env, "R2");
    assert_eq!(p.flota.try_crear_ruta(&txt(&p.env, "R"), &txt(&p.env, "Corta")), Err(Ok(Error::DatoInvalido)));
    p.flota.crear_ruta(&r1, &txt(&p.env, "Indios Verdes - Pantitlán"));
    assert_eq!(firmante(&p), p.admin);
    assert_eq!(p.flota.try_crear_ruta(&r1, &txt(&p.env, "Otra")), Err(Ok(Error::RutaExiste)));
    p.flota.crear_ruta(&r2, &txt(&p.env, "Tasqueña - Huipulco"));

    assert_eq!(p.flota.try_asignar_ruta(&p.socio, &pl, &txt(&p.env, "R9")), Err(Ok(Error::RutaNoDisponible)));
    assert_eq!(p.flota.asignar_ruta(&p.socio, &pl, &r1), 1);
    assert_eq!(p.flota.try_asignar_ruta(&p.socio, &pl, &r1), Err(Ok(Error::RutaYaAsignada)));
    assert_eq!(p.flota.try_cerrar_ruta(&r1), Err(Ok(Error::RutaConUnidades)));

    // Moverla a otra ruta libera la anterior.
    p.flota.asignar_ruta(&p.socio, &pl, &r2);
    assert_eq!(p.flota.ruta(&r1).unwrap().unidades, 0);
    assert_eq!(p.flota.ruta_de(&pl), Some(r2.clone()));
    p.flota.cerrar_ruta(&r1);
    assert!(!p.flota.ruta(&r1).unwrap().abierta);
    assert_eq!(p.flota.try_cerrar_ruta(&r1), Err(Ok(Error::RutaNoDisponible)));
    assert_eq!(p.flota.try_asignar_ruta(&p.socio, &pl, &r1), Err(Ok(Error::RutaNoDisponible)));

    p.flota.desasignar_ruta(&p.socio, &pl);
    assert_eq!(p.flota.ruta(&r2).unwrap().unidades, 0);
    assert_eq!(p.flota.try_desasignar_ruta(&p.socio, &pl), Err(Ok(Error::SinRuta)));
}

#[test]
fn una_unidad_vencida_no_entra_a_ruta() {
    let p = preparar();
    p.flota.registrar_socio(&p.socio, &h(&p.env, 90));
    let pl = txt(&p.env, "VEN001");
    p.reg.poner_expediente(&h(&p.env, 2), &pl, &p.taller, &false);
    p.flota.alta_unidad(&p.socio, &pl);
    p.flota.crear_ruta(&txt(&p.env, "R1"), &txt(&p.env, "Indios Verdes - Pantitlán"));
    assert_eq!(p.flota.try_asignar_ruta(&p.socio, &pl, &txt(&p.env, "R1")), Err(Ok(Error::UnidadNoVigente)));
}

#[test]
fn jornada_exige_operador_vigencia_y_sin_revision() {
    let p = preparar();
    let pl = txt(&p.env, "ABC123");
    let op = Address::generate(&p.env);
    assert_eq!(p.flota.try_iniciar_jornada(&op, &pl), Err(Ok(Error::NoEsOperador)));
    p.reg.poner_operador(&pl, &op);
    assert_eq!(p.flota.try_iniciar_jornada(&op, &pl), Err(Ok(Error::UnidadSinFlota)));
    con_unidad(&p);

    p.reg.poner_revision(&pl, &true);
    assert_eq!(p.flota.try_iniciar_jornada(&op, &pl), Err(Ok(Error::UnidadEnRevision)));
    p.reg.poner_revision(&pl, &false);

    p.flota.iniciar_jornada(&op, &pl);
    assert_eq!(firmante(&p), op);
    assert_eq!(p.flota.try_iniciar_jornada(&op, &pl), Err(Ok(Error::JornadaAbierta)));
}

#[test]
fn una_unidad_vencida_no_arranca_jornada() {
    let p = preparar();
    p.flota.registrar_socio(&p.socio, &h(&p.env, 90));
    let pl = txt(&p.env, "VEN001");
    p.reg.poner_expediente(&h(&p.env, 2), &pl, &p.taller, &false);
    p.flota.alta_unidad(&p.socio, &pl);
    let op = Address::generate(&p.env);
    p.reg.poner_operador(&pl, &op);
    assert_eq!(p.flota.try_iniciar_jornada(&op, &pl), Err(Ok(Error::UnidadNoVigente)));
}

#[test]
fn terminar_jornada_suma_horas_y_km() {
    let p = preparar();
    let pl = con_unidad(&p);
    let op = Address::generate(&p.env);
    p.reg.poner_operador(&pl, &op);
    assert_eq!(p.flota.try_terminar_jornada(&op, &pl, &1000), Err(Ok(Error::SinJornada)));

    p.flota.iniciar_jornada(&op, &pl);
    assert_eq!(p.flota.try_terminar_jornada(&Address::generate(&p.env), &pl, &1000), Err(Ok(Error::NoEsOperador)));
    p.env.ledger().set_timestamp(AHORA + 8 * 3600);
    assert_eq!(p.flota.terminar_jornada(&op, &pl, &50_000), 0);

    p.flota.iniciar_jornada(&op, &pl);
    p.env.ledger().set_timestamp(AHORA + 20 * 3600);
    assert_eq!(p.flota.try_terminar_jornada(&op, &pl, &49_000), Err(Ok(Error::KilometrajeInvalido)));
    assert_eq!(p.flota.terminar_jornada(&op, &pl, &50_180), 180);
    let t = p.flota.totales(&pl).unwrap();
    assert_eq!((t.jornadas, t.segundos, t.km), (2, 20 * 3600, 180));
    assert_eq!(p.flota.jornada(&pl), None);
}

// ── Fondo de mantenimiento ──

#[test]
fn fondo_depositar_pagar_al_taller_y_retirar() {
    let p = preparar();
    let pl = con_unidad(&p);
    let _ = pl;
    assert_eq!(p.flota.try_depositar_fondo(&p.socio, &0), Err(Ok(Error::MontoInvalido)));
    assert_eq!(p.flota.depositar_fondo(&p.socio, &(100 * XLM)), 100 * XLM);
    assert_eq!(p.xlm.balance(&p.socio), 900 * XLM);

    let h1 = h(&p.env, 1);
    assert_eq!(p.flota.try_pagar_servicio(&p.socio, &h1, &(200 * XLM)), Err(Ok(Error::SaldoInsuficiente)));
    assert_eq!(p.flota.pagar_servicio(&p.socio, &h1, &(60 * XLM)), 40 * XLM);
    assert_eq!(p.xlm.balance(&p.taller), 60 * XLM);
    assert_eq!(p.flota.pago(&h1).unwrap().taller, p.taller);
    assert_eq!(p.flota.try_pagar_servicio(&p.socio, &h1, &XLM), Err(Ok(Error::YaPagado)));

    assert_eq!(p.flota.try_retirar_fondo(&p.socio, &(41 * XLM)), Err(Ok(Error::SaldoInsuficiente)));
    assert_eq!(p.flota.retirar_fondo(&p.socio, &(40 * XLM)), 0);
    assert_eq!(p.xlm.balance(&p.socio), 940 * XLM);
}

#[test]
fn solo_se_pagan_servicios_de_unidades_propias() {
    let p = preparar();
    p.flota.registrar_socio(&p.socio, &h(&p.env, 90));
    p.flota.depositar_fondo(&p.socio, &(10 * XLM));
    // ABC123 no es de su flota.
    assert_eq!(p.flota.try_pagar_servicio(&p.socio, &h(&p.env, 1), &XLM), Err(Ok(Error::NoEsDueno)));
    assert_eq!(p.flota.try_pagar_servicio(&p.socio, &h(&p.env, 9), &XLM), Err(Ok(Error::ExpedienteNoExiste)));
    let extrano = Address::generate(&p.env);
    assert_eq!(p.flota.try_depositar_fondo(&extrano, &XLM), Err(Ok(Error::NoEsSocio)));
}

// ── Garantías ──

#[test]
fn garantia_emitir_reclamar_y_resolver() {
    let p = preparar();
    con_unidad(&p);
    let h1 = h(&p.env, 1);
    let otro = Address::generate(&p.env);
    assert_eq!(p.flota.try_emitir_garantia(&otro, &h1, &30), Err(Ok(Error::NoEsDelTaller)));
    assert_eq!(p.flota.try_emitir_garantia(&p.taller, &h1, &91), Err(Ok(Error::DatoInvalido)));
    assert_eq!(p.flota.emitir_garantia(&p.taller, &h1, &30), AHORA + 30 * DIA);
    assert_eq!(firmante(&p), p.taller);
    assert_eq!(p.flota.try_emitir_garantia(&p.taller, &h1, &30), Err(Ok(Error::GarantiaExiste)));

    assert_eq!(p.flota.try_resolver_garantia(&p.taller, &h1, &true), Err(Ok(Error::SinReclamo)));
    p.flota.reclamar_garantia(&p.socio, &h1, &h(&p.env, 77));
    assert_eq!(p.flota.try_reclamar_garantia(&p.socio, &h1, &h(&p.env, 78)), Err(Ok(Error::ReclamoAbierto)));
    assert_eq!(p.flota.try_resolver_garantia(&otro, &h1, &true), Err(Ok(Error::NoEsDelTaller)));
    p.flota.resolver_garantia(&p.taller, &h1, &false);
    assert_eq!(p.flota.garantia(&h1).unwrap().estado, GARANTIA_RECHAZADA);

    // Tras un rechazo se puede reclamar otra vez mientras siga vigente.
    p.flota.reclamar_garantia(&p.socio, &h1, &h(&p.env, 79));
    p.flota.resolver_garantia(&p.taller, &h1, &true);
    assert_eq!(p.flota.garantia(&h1).unwrap().estado, GARANTIA_ACEPTADA);
}

#[test]
fn garantia_vencida_ajena_o_de_taller_suspendido() {
    let p = preparar();
    let h1 = h(&p.env, 1);
    p.flota.emitir_garantia(&p.taller, &h1, &10);
    // El socio aún no es dueño de la unidad.
    p.flota.registrar_socio(&p.socio, &h(&p.env, 90));
    assert_eq!(p.flota.try_reclamar_garantia(&p.socio, &h1, &h(&p.env, 77)), Err(Ok(Error::NoEsDueno)));
    p.flota.alta_unidad(&p.socio, &txt(&p.env, "ABC123"));
    p.env.ledger().set_timestamp(AHORA + 11 * DIA);
    assert_eq!(p.flota.try_reclamar_garantia(&p.socio, &h1, &h(&p.env, 77)), Err(Ok(Error::GarantiaVencida)));
    assert_eq!(p.flota.try_reclamar_garantia(&p.socio, &h(&p.env, 9), &h(&p.env, 77)), Err(Ok(Error::SinGarantia)));

    p.reg.poner_expediente(&h(&p.env, 3), &txt(&p.env, "DEF456"), &p.taller, &true);
    p.reg.aprobar(&p.taller, &false);
    assert_eq!(p.flota.try_emitir_garantia(&p.taller, &h(&p.env, 3), &10), Err(Ok(Error::TallerNoAprobado)));
}

// ── Calificaciones y multas ──

#[test]
fn calificar_taller_una_vez_por_servicio_y_promedio() {
    let p = preparar();
    con_unidad(&p);
    let h1 = h(&p.env, 1);
    assert_eq!(p.flota.try_calificar_taller(&p.socio, &h1, &6), Err(Ok(Error::DatoInvalido)));
    assert_eq!(p.flota.try_calificar_taller(&p.socio, &h1, &0), Err(Ok(Error::DatoInvalido)));
    assert_eq!(p.flota.calificar_taller(&p.socio, &h1, &5), 500);
    assert_eq!(p.flota.try_calificar_taller(&p.socio, &h1, &4), Err(Ok(Error::YaCalificado)));

    // Segundo servicio del mismo taller en otra unidad del socio: el promedio baja a 4.0.
    let pl2 = txt(&p.env, "DEF456");
    p.reg.poner_expediente(&h(&p.env, 3), &pl2, &p.taller, &true);
    p.flota.alta_unidad(&p.socio, &pl2);
    assert_eq!(p.flota.calificar_taller(&p.socio, &h(&p.env, 3), &3), 400);
    assert_eq!(p.flota.reputacion(&p.taller).unwrap().calificaciones, 2);

    let extrano = Address::generate(&p.env);
    assert_eq!(p.flota.try_calificar_taller(&extrano, &h1, &1), Err(Ok(Error::NoEsDueno)));
}

#[test]
fn multas_registrar_pagar_y_cancelar() {
    let p = preparar();
    assert_eq!(p.flota.try_registrar_multa(&txt(&p.env, "ABC123"), &XLM, &txt(&p.env, "Sin flota")), Err(Ok(Error::UnidadSinFlota)));
    let pl = con_unidad(&p);
    assert_eq!(p.flota.try_registrar_multa(&pl, &0, &txt(&p.env, "Monto cero")), Err(Ok(Error::MontoInvalido)));
    assert_eq!(p.flota.try_registrar_multa(&pl, &XLM, &txt(&p.env, "x")), Err(Ok(Error::MotivoInvalido)));
    assert_eq!(p.flota.registrar_multa(&pl, &(5 * XLM), &txt(&p.env, "Exceso de pasaje")), 0);
    assert_eq!(firmante(&p), p.admin);
    assert_eq!(p.flota.registrar_multa(&pl, &(2 * XLM), &txt(&p.env, "Puerta abierta")), 1);

    p.flota.pagar_multa(&p.socio, &pl, &0);
    assert_eq!(firmante(&p), p.socio);
    assert_eq!(p.xlm.balance(&p.admin), 5 * XLM);
    assert_eq!(p.flota.multa(&pl, &0).unwrap().estado, MULTA_PAGADA);
    assert_eq!(p.flota.try_pagar_multa(&p.socio, &pl, &0), Err(Ok(Error::MultaNoPendiente)));
    assert_eq!(p.flota.try_pagar_multa(&p.socio, &pl, &7), Err(Ok(Error::SinMulta)));

    assert_eq!(p.flota.try_cancelar_multa(&pl, &1, &txt(&p.env, "x")), Err(Ok(Error::MotivoInvalido)));
    p.flota.cancelar_multa(&pl, &1, &txt(&p.env, "Multa duplicada"));
    assert_eq!(p.flota.multa(&pl, &1).unwrap().estado, MULTA_CANCELADA);
    assert_eq!(p.flota.try_cancelar_multa(&pl, &0, &txt(&p.env, "Ya pagada")), Err(Ok(Error::MultaNoPendiente)));
    // Sin multas pendientes ya se puede dar de baja.
    p.flota.baja_unidad_flota(&p.socio, &pl, &txt(&p.env, "Unidad vendida"));
}

#[test]
fn solo_el_dueno_paga_y_solo_el_admin_multa_o_crea_rutas() {
    let env = Env::default();
    env.ledger().set_timestamp(AHORA);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let reg_id = env.register(MockRegistro, ());
    let id = env.register(QrutaFlota, (&admin, &reg_id, &sac.address()));
    let flota = QrutaFlotaClient::new(&env, &id);
    // Sin firmas: todo lo que exige autorización se rechaza.
    assert!(flota.try_crear_ruta(&txt(&env, "R1"), &txt(&env, "Indios Verdes")).is_err());
    assert!(flota.try_registrar_multa(&txt(&env, "ABC123"), &XLM, &txt(&env, "Prueba")).is_err());
    assert!(flota.try_registrar_socio(&Address::generate(&env), &h(&env, 1)).is_err());
    assert_eq!(flota.admin(), admin);
}
