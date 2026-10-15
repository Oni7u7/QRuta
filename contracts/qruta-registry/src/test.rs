#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    BytesN, Env, IntoVal, String, Symbol,
};

const DIA: u64 = 86_400;
// 2026-10-01 00:00:00 UTC
const FECHA: u64 = 1_790_812_800;

struct Prueba<'a> {
    env: Env,
    admin: Address,
    taller: Address,
    client: QrutaRegistryClient<'a>,
}

fn preparar() -> Prueba<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(FECHA + DIA);
    let admin = Address::generate(&env);
    let taller = Address::generate(&env);
    let id = env.register(QrutaRegistry, (&admin,));
    let client = QrutaRegistryClient::new(&env, &id);
    Prueba { env, admin, taller, client }
}

fn hash(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn placa(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

fn tipo(env: &Env, s: &str) -> Symbol {
    Symbol::new(env, s)
}

#[test]
fn el_constructor_fija_el_admin() {
    let p = preparar();
    assert_eq!(p.client.admin(), p.admin);
}

#[test]
fn taller_no_aprobado_no_puede_registrar() {
    let p = preparar();
    let r = p.client.try_registrar(&p.taller, &placa(&p.env, "ABC123"), &hash(&p.env, 1), &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    assert_eq!(r, Err(Ok(Error::TallerNoAprobado)));
}

#[test]
fn registro_completo_y_consultas() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    assert!(p.client.es_aprobado(&p.taller));

    let h = hash(&p.env, 1);
    p.client.registrar(&p.taller, &placa(&p.env, "ABC123"), &h, &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));

    let reg = p.client.expediente(&h).unwrap();
    assert_eq!(reg.placa, placa(&p.env, "ABC123"));
    assert_eq!(reg.taller, p.taller);
    assert_eq!(reg.vigente_hasta, FECHA + 90 * DIA);

    let est = p.client.estado(&placa(&p.env, "ABC123")).unwrap();
    assert_eq!(est.hash, h);
    assert!(est.vigente);

    assert_eq!(p.client.expediente(&hash(&p.env, 9)), None);
    assert_eq!(p.client.estado(&placa(&p.env, "ZZZ999")), None);
}

#[test]
fn registrar_exige_la_firma_del_taller() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let h = hash(&p.env, 1);
    p.client.registrar(&p.taller, &placa(&p.env, "ABC123"), &h, &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));

    // La única autorización pedida fue la del taller, no la del admin.
    let auths = p.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, p.taller);
}

#[test]
fn sin_firma_del_taller_falla() {
    let env = Env::default();
    env.ledger().set_timestamp(FECHA + DIA);
    let admin = Address::generate(&env);
    let taller = Address::generate(&env);
    let id = env.register(QrutaRegistry, (&admin,));
    let client = QrutaRegistryClient::new(&env, &id);

    // El admin aprueba con su firma.
    client
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke { contract: &id, fn_name: "aprobar_taller", args: (&taller,).into_val(&env), sub_invokes: &[] },
        }])
        .aprobar_taller(&taller);
    assert!(client.es_aprobado(&taller));

    // Nadie firma como el taller: el registro se rechaza.
    let r = client.try_registrar(&taller, &placa(&env, "ABC123"), &hash(&env, 1), &tipo(&env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    assert!(r.is_err());
    assert_eq!(client.expediente(&hash(&env, 1)), None);
}

#[test]
fn solo_el_admin_aprueba_talleres() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let intruso = Address::generate(&env);
    let taller = Address::generate(&env);
    let id = env.register(QrutaRegistry, (&admin,));
    let client = QrutaRegistryClient::new(&env, &id);

    // El intruso firma, pero el contrato exige la firma del admin.
    let r = client
        .mock_auths(&[MockAuth {
            address: &intruso,
            invoke: &MockAuthInvoke { contract: &id, fn_name: "aprobar_taller", args: (&taller,).into_val(&env), sub_invokes: &[] },
        }])
        .try_aprobar_taller(&taller);
    assert!(r.is_err());
    assert!(!client.es_aprobado(&taller));
}

#[test]
fn taller_suspendido_no_registra_pero_conserva_lo_anterior() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let h1 = hash(&p.env, 1);
    p.client.registrar(&p.taller, &placa(&p.env, "ABC123"), &h1, &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));

    p.client.suspender_taller(&p.taller);
    assert!(!p.client.es_aprobado(&p.taller));
    let r = p.client.try_registrar(&p.taller, &placa(&p.env, "ABC123"), &hash(&p.env, 2), &tipo(&p.env, "correctivo"), &FECHA, &(FECHA + 30 * DIA));
    assert_eq!(r, Err(Ok(Error::TallerNoAprobado)));
    assert!(p.client.expediente(&h1).is_some());
}

#[test]
fn hash_duplicado_se_rechaza() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let h = hash(&p.env, 1);
    p.client.registrar(&p.taller, &placa(&p.env, "ABC123"), &h, &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    let r = p.client.try_registrar(&p.taller, &placa(&p.env, "XYZ789"), &h, &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    assert_eq!(r, Err(Ok(Error::ExpedienteDuplicado)));
}

#[test]
fn validaciones_de_datos() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let hasta = FECHA + 90 * DIA;
    assert_eq!(
        p.client.try_registrar(&p.taller, &placa(e, "AB"), &hash(e, 1), &tipo(e, "preventivo"), &FECHA, &hasta),
        Err(Ok(Error::PlacaInvalida))
    );
    assert_eq!(
        p.client.try_registrar(&p.taller, &placa(e, "ABCDEFGHIJK"), &hash(e, 1), &tipo(e, "preventivo"), &FECHA, &hasta),
        Err(Ok(Error::PlacaInvalida))
    );
    assert_eq!(
        p.client.try_registrar(&p.taller, &placa(e, "ABC123"), &hash(e, 1), &tipo(e, "lavado"), &FECHA, &hasta),
        Err(Ok(Error::TipoInvalido))
    );
    assert_eq!(
        p.client.try_registrar(&p.taller, &placa(e, "ABC123"), &hash(e, 1), &tipo(e, "preventivo"), &FECHA, &FECHA),
        Err(Ok(Error::VigenciaInvalida))
    );
}

#[test]
fn el_estado_usa_el_servicio_mas_reciente_por_fecha() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let reciente = hash(e, 1);
    let antiguo = hash(e, 2);
    let mismo_dia = hash(e, 3);

    p.client.registrar(&p.taller, &placa(e, "ABC123"), &reciente, &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    // Un servicio con fecha anterior registrado después no cambia el estado.
    p.client.registrar(&p.taller, &placa(e, "ABC123"), &antiguo, &tipo(e, "correctivo"), &(FECHA - 60 * DIA), &(FECHA - 30 * DIA));
    assert_eq!(p.client.estado(&placa(e, "ABC123")).unwrap().hash, reciente);
    // Con la misma fecha, gana el último registrado.
    p.client.registrar(&p.taller, &placa(e, "ABC123"), &mismo_dia, &tipo(e, "correctivo"), &FECHA, &(FECHA + 30 * DIA));
    assert_eq!(p.client.estado(&placa(e, "ABC123")).unwrap().hash, mismo_dia);
}

#[test]
fn la_vigencia_se_calcula_con_la_hora_del_ledger() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    p.client.registrar(&p.taller, &placa(e, "VEN001"), &hash(e, 1), &tipo(e, "correctivo"), &FECHA, &(FECHA + 30 * DIA));
    assert!(p.client.estado(&placa(e, "VEN001")).unwrap().vigente);
    e.ledger().set_timestamp(FECHA + 31 * DIA);
    assert!(!p.client.estado(&placa(e, "VEN001")).unwrap().vigente);
}
