#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    Bytes, Env, IntoVal,
};

const XLM: i128 = 10_000_000;
const MONTO: i128 = 5555 * XLM;

struct Prueba<'a> {
    env: Env,
    id: Address,
    xlm: TokenClient<'a>,
    boveda: QrutaBovedaClient<'a>,
    duenio: Address,
}

fn huella(env: &Env, codigo: &str) -> BytesN<32> {
    env.crypto().sha256(&Bytes::from_slice(env, codigo.as_bytes())).to_bytes()
}

fn preparar() -> Prueba<'static> {
    let env = Env::default();
    env.mock_all_auths();
    let emisor = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(emisor);
    let duenio = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&duenio, &(10_000 * XLM));
    let id = env.register(QrutaBoveda, (&sac.address(), &huella(&env, "Ship It")));
    let boveda = QrutaBovedaClient::new(&env, &id);
    let xlm = TokenClient::new(&env, &sac.address());
    Prueba { env, id, xlm, boveda, duenio }
}

fn codigo(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

#[test]
fn depositar_guarda_los_xlm_en_la_boveda() {
    let p = preparar();
    assert_eq!(p.boveda.depositar(&p.duenio, &MONTO), MONTO);
    assert_eq!(p.boveda.saldo(), MONTO);
    assert_eq!(p.xlm.balance(&p.id), MONTO);
    assert_eq!(p.xlm.balance(&p.duenio), 10_000 * XLM - MONTO);
}

#[test]
fn con_el_codigo_correcto_se_lleva_todo() {
    let p = preparar();
    p.boveda.depositar(&p.duenio, &MONTO);
    let quien = Address::generate(&p.env);

    assert_eq!(p.boveda.reclamar(&quien, &codigo(&p.env, "Ship It")), MONTO);
    // Firmó quien reclama.
    assert_eq!(p.env.auths()[0].0, quien);
    assert_eq!(p.xlm.balance(&quien), MONTO);
    assert_eq!(p.boveda.saldo(), 0);
    assert_eq!(p.boveda.abierta_por(), Some(quien));
}

#[test]
fn con_un_codigo_incorrecto_no_entrega_nada() {
    let p = preparar();
    p.boveda.depositar(&p.duenio, &MONTO);
    let quien = Address::generate(&p.env);
    for malo in ["ship it", "Ship it", "ShipIt", "Ship It ", ""] {
        assert_eq!(p.boveda.try_reclamar(&quien, &codigo(&p.env, malo)), Err(Ok(Error::CodigoIncorrecto)));
    }
    assert_eq!(p.boveda.saldo(), MONTO);
    assert_eq!(p.boveda.abierta_por(), None);
}

#[test]
fn solo_se_abre_una_vez() {
    let p = preparar();
    p.boveda.depositar(&p.duenio, &MONTO);
    let primero = Address::generate(&p.env);
    let segundo = Address::generate(&p.env);
    p.boveda.reclamar(&primero, &codigo(&p.env, "Ship It"));
    assert_eq!(p.boveda.try_reclamar(&segundo, &codigo(&p.env, "Ship It")), Err(Ok(Error::YaAbierta)));
    assert_eq!(p.boveda.try_depositar(&p.duenio, &XLM), Err(Ok(Error::YaAbierta)));
    assert_eq!(p.xlm.balance(&segundo), 0);
}

#[test]
fn una_boveda_vacia_no_se_abre() {
    let p = preparar();
    let quien = Address::generate(&p.env);
    assert_eq!(p.boveda.try_reclamar(&quien, &codigo(&p.env, "Ship It")), Err(Ok(Error::SinFondos)));
    assert_eq!(p.boveda.abierta_por(), None);
}

#[test]
fn depositar_valida_el_monto() {
    let p = preparar();
    assert_eq!(p.boveda.try_depositar(&p.duenio, &0), Err(Ok(Error::MontoInvalido)));
    assert_eq!(p.boveda.try_depositar(&p.duenio, &-5), Err(Ok(Error::MontoInvalido)));
}

#[test]
fn reclamar_exige_la_firma_del_destino() {
    let env = Env::default();
    let emisor = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(emisor);
    let duenio = Address::generate(&env);
    env.mock_all_auths();
    StellarAssetClient::new(&env, &sac.address()).mint(&duenio, &MONTO);
    let id = env.register(QrutaBoveda, (&sac.address(), &huella(&env, "Ship It")));
    let boveda = QrutaBovedaClient::new(&env, &id);
    boveda.depositar(&duenio, &MONTO);

    // Alguien con el código intenta mandar los XLM a otra cuenta sin su firma.
    let victima = Address::generate(&env);
    let atacante = Address::generate(&env);
    let c = codigo(&env, "Ship It");
    let r = boveda
        .mock_auths(&[MockAuth {
            address: &atacante,
            invoke: &MockAuthInvoke { contract: &id, fn_name: "reclamar", args: (&victima, &c).into_val(&env), sub_invokes: &[] },
        }])
        .try_reclamar(&victima, &c);
    assert!(r.is_err());
    assert_eq!(boveda.saldo(), MONTO);
}
