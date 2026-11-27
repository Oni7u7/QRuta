#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger, MockAuth, MockAuthInvoke},
    BytesN, Env, IntoVal, String, Symbol,
};

const DIA: u64 = 86_400;
// 2026-10-01 00:00:00 UTC
const FECHA: u64 = 1_790_812_800;

struct Prueba<'a> {
    env: Env,
    id: Address,
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
    Prueba { env, id, admin, taller, client }
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

#[test]
fn la_vigencia_no_puede_exceder_la_del_tipo() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    // Correctivo: 30 días (+1 por el final del día) sí; 32 no.
    p.client.registrar(&p.taller, &placa(e, "ABC123"), &hash(e, 1), &tipo(e, "correctivo"), &FECHA, &(FECHA + 31 * DIA - 1));
    assert_eq!(
        p.client.try_registrar(&p.taller, &placa(e, "ABC123"), &hash(e, 2), &tipo(e, "correctivo"), &FECHA, &(FECHA + 32 * DIA)),
        Err(Ok(Error::VigenciaInvalida))
    );
    // Una vigencia de 50 años se rechaza aunque el tipo sea el de mayor vigencia.
    assert_eq!(
        p.client.try_registrar(&p.taller, &placa(e, "ABC123"), &hash(e, 3), &tipo(e, "verificacion"), &FECHA, &(FECHA + 50 * 365 * DIA)),
        Err(Ok(Error::VigenciaInvalida))
    );
    p.client.registrar(&p.taller, &placa(e, "ABC123"), &hash(e, 4), &tipo(e, "verificacion"), &FECHA, &(FECHA + 180 * DIA));
}

#[test]
fn la_fecha_no_puede_estar_en_el_futuro() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let ahora = e.ledger().timestamp();
    // Hasta 2 días adelante se acepta (husos horarios); más, no.
    p.client.registrar(&p.taller, &placa(e, "ABC123"), &hash(e, 1), &tipo(e, "correctivo"), &(ahora + 2 * DIA), &(ahora + 32 * DIA));
    let lejana = ahora + 80 * 365 * DIA;
    assert_eq!(
        p.client.try_registrar(&p.taller, &placa(e, "ABC123"), &hash(e, 2), &tipo(e, "correctivo"), &lejana, &(lejana + 30 * DIA)),
        Err(Ok(Error::FechaFutura))
    );
}

fn ttl(p: &Prueba, clave: &Clave) -> u32 {
    p.env.as_contract(&p.id, || p.env.storage().persistent().get_ttl(clave))
}

#[test]
fn los_datos_viven_al_menos_hasta_que_vence_el_servicio() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let ahora = e.ledger().timestamp();
    let h = hash(e, 1);
    // Verificación: 180 días, más que los 120 que se extendían antes.
    p.client.registrar(&p.taller, &placa(e, "VER180"), &h, &tipo(e, "verificacion"), &ahora, &(ahora + 180 * DIA));

    let necesario = ((180 * DIA / 5) as u32).min(e.storage().max_ttl());
    assert!(ttl(&p, &Clave::Expediente(h.clone())) >= necesario);
    assert!(ttl(&p, &Clave::Ultimo(placa(e, "VER180"))) >= necesario);
    assert!(ttl(&p, &Clave::Taller(p.taller.clone())) >= necesario);
}

#[test]
fn el_entorno_de_prueba_permite_ttl_de_mas_de_120_dias() {
    // Si no, la prueba anterior no demostraría nada.
    let p = preparar();
    assert!(p.env.storage().max_ttl() > 180 * 17_280);
}

#[test]
fn renovar_extiende_los_datos_de_la_placa() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let ahora = e.ledger().timestamp();
    let h = hash(e, 1);
    p.client.registrar(&p.taller, &placa(e, "REN001"), &h, &tipo(e, "verificacion"), &ahora, &(ahora + 180 * DIA));

    // Pasan 100 días: el TTL bajó y renovar lo vuelve a cubrir hasta el vencimiento.
    let ledger = e.ledger().sequence();
    e.ledger().set_sequence_number(ledger + 100 * 17_280);
    e.ledger().set_timestamp(ahora + 100 * DIA);
    let antes = ttl(&p, &Clave::Expediente(h.clone()));

    let aplicado = p.client.renovar(&placa(e, "REN001"));
    assert!(aplicado >= ((80 * DIA / 5) as u32));
    assert!(ttl(&p, &Clave::Expediente(h.clone())) > antes);
    assert!(ttl(&p, &Clave::Expediente(h)) >= aplicado);
    assert!(ttl(&p, &Clave::Ultimo(placa(e, "REN001"))) >= aplicado);
    assert!(ttl(&p, &Clave::Taller(p.taller.clone())) >= aplicado);
}

#[test]
fn renovar_no_pide_firma() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    p.client.registrar(&p.taller, &placa(e, "REN002"), &hash(e, 1), &tipo(e, "correctivo"), &FECHA, &(FECHA + 30 * DIA));
    p.client.renovar(&placa(e, "REN002"));
    assert_eq!(e.auths().len(), 0);
}

#[test]
fn renovar_una_placa_sin_registro_falla() {
    let p = preparar();
    assert_eq!(p.client.try_renovar(&placa(&p.env, "NADA01")), Err(Ok(Error::PlacaSinRegistro)));
}

fn motivo(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

#[test]
fn el_admin_anula_un_expediente_y_la_placa_queda_sin_estado() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let h = hash(e, 1);
    p.client.registrar(&p.taller, &placa(e, "ANU001"), &h, &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA));

    p.client.anular_expediente(&h, &motivo(e, "Servicio no realizado"));

    let a = p.client.anulacion(&h).unwrap();
    assert_eq!(a.motivo, motivo(e, "Servicio no realizado"));
    // El registro se conserva como evidencia, pero ya no define el estado de la placa.
    assert!(p.client.expediente(&h).is_some());
    assert_eq!(p.client.estado(&placa(e, "ANU001")), None);
}

#[test]
fn anular_un_servicio_viejo_no_cambia_el_estado_actual() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let viejo = hash(e, 1);
    let actual = hash(e, 2);
    p.client.registrar(&p.taller, &placa(e, "ANU002"), &viejo, &tipo(e, "correctivo"), &(FECHA - 20 * DIA), &(FECHA + 10 * DIA));
    p.client.registrar(&p.taller, &placa(e, "ANU002"), &actual, &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA));

    p.client.anular_expediente(&viejo, &motivo(e, "Duplicado"));
    assert_eq!(p.client.estado(&placa(e, "ANU002")).unwrap().hash, actual);
}

#[test]
fn anular_valida_motivo_existencia_y_que_no_este_anulado() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let h = hash(e, 1);
    assert_eq!(p.client.try_anular_expediente(&h, &motivo(e, "No existe")), Err(Ok(Error::ExpedienteNoExiste)));
    p.client.registrar(&p.taller, &placa(e, "ANU003"), &h, &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    assert_eq!(p.client.try_anular_expediente(&h, &motivo(e, "")), Err(Ok(Error::MotivoInvalido)));
    p.client.anular_expediente(&h, &motivo(e, "Fraude"));
    assert_eq!(p.client.try_anular_expediente(&h, &motivo(e, "Otra vez")), Err(Ok(Error::ExpedienteAnulado)));
}

#[test]
fn solo_el_admin_anula() {
    let env = Env::default();
    env.ledger().set_timestamp(FECHA + DIA);
    let admin = Address::generate(&env);
    let taller = Address::generate(&env);
    let id = env.register(QrutaRegistry, (&admin,));
    let client = QrutaRegistryClient::new(&env, &id);
    env.mock_all_auths();
    client.aprobar_taller(&taller);
    let h = hash(&env, 1);
    client.registrar(&taller, &placa(&env, "ANU004"), &h, &tipo(&env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));

    // El taller firma, pero anular exige la firma del admin.
    let m = motivo(&env, "Me equivoqué");
    let r = client
        .mock_auths(&[MockAuth {
            address: &taller,
            invoke: &MockAuthInvoke { contract: &id, fn_name: "anular_expediente", args: (&h, &m).into_val(&env), sub_invokes: &[] },
        }])
        .try_anular_expediente(&h, &m);
    assert!(r.is_err());
    assert_eq!(client.anulacion(&h), None);
}

#[test]
fn el_taller_corrige_su_expediente_y_el_nuevo_toma_su_lugar() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let original = hash(e, 1);
    let corregido = hash(e, 2);
    p.client.registrar(&p.taller, &placa(e, "COR001"), &original, &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA));

    p.client.corregir_expediente(
        &p.taller, &original, &corregido, &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA), &motivo(e, "Kilometraje mal capturado"),
    );
    // Firmó el taller, no QRuta.
    assert_eq!(e.auths()[0].0, p.taller);

    assert_eq!(p.client.correccion(&original), Some(corregido.clone()));
    assert_eq!(p.client.anulacion(&original).unwrap().motivo, motivo(e, "Kilometraje mal capturado"));
    let est = p.client.estado(&placa(e, "COR001")).unwrap();
    assert_eq!(est.hash, corregido);
    // La placa se conserva.
    assert_eq!(est.registro.placa, placa(e, "COR001"));
}

#[test]
fn corregir_un_servicio_viejo_no_desplaza_al_actual() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let viejo = hash(e, 1);
    let actual = hash(e, 2);
    p.client.registrar(&p.taller, &placa(e, "COR002"), &viejo, &tipo(e, "correctivo"), &(FECHA - 20 * DIA), &(FECHA + 10 * DIA));
    p.client.registrar(&p.taller, &placa(e, "COR002"), &actual, &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA));

    p.client.corregir_expediente(
        &p.taller, &viejo, &hash(e, 3), &tipo(e, "correctivo"), &(FECHA - 20 * DIA), &(FECHA + 10 * DIA), &motivo(e, "Notas"),
    );
    assert_eq!(p.client.estado(&placa(e, "COR002")).unwrap().hash, actual);
}

#[test]
fn otro_taller_no_puede_corregir() {
    let p = preparar();
    let e = &p.env;
    let otro = Address::generate(e);
    p.client.aprobar_taller(&p.taller);
    p.client.aprobar_taller(&otro);
    let h = hash(e, 1);
    p.client.registrar(&p.taller, &placa(e, "COR003"), &h, &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    let r = p.client.try_corregir_expediente(
        &otro, &h, &hash(e, 2), &tipo(e, "preventivo"), &FECHA, &(FECHA + 90 * DIA), &motivo(e, "Intento"),
    );
    assert_eq!(r, Err(Ok(Error::NoEsDelTaller)));
    assert_eq!(p.client.correccion(&h), None);
}

#[test]
fn corregir_valida_estado_del_anterior_y_del_nuevo() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let h = hash(e, 1);
    let hasta = FECHA + 90 * DIA;
    let pre = tipo(e, "preventivo");
    let m = motivo(e, "Corrección");
    assert_eq!(
        p.client.try_corregir_expediente(&p.taller, &h, &hash(e, 2), &pre, &FECHA, &hasta, &m),
        Err(Ok(Error::ExpedienteNoExiste))
    );
    p.client.registrar(&p.taller, &placa(e, "COR004"), &h, &pre, &FECHA, &hasta);
    // El nuevo pasa por las mismas validaciones que registrar.
    assert_eq!(
        p.client.try_corregir_expediente(&p.taller, &h, &hash(e, 2), &pre, &FECHA, &(FECHA + 400 * DIA), &m),
        Err(Ok(Error::VigenciaInvalida))
    );
    assert_eq!(
        p.client.try_corregir_expediente(&p.taller, &h, &h, &pre, &FECHA, &hasta, &m),
        Err(Ok(Error::ExpedienteDuplicado))
    );
    p.client.corregir_expediente(&p.taller, &h, &hash(e, 2), &pre, &FECHA, &hasta, &m);
    assert_eq!(
        p.client.try_corregir_expediente(&p.taller, &h, &hash(e, 3), &pre, &FECHA, &hasta, &m),
        Err(Ok(Error::ExpedienteYaCorregido))
    );
}

#[test]
fn no_se_corrige_un_expediente_anulado_ni_con_taller_suspendido() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let e = &p.env;
    let pre = tipo(e, "preventivo");
    let hasta = FECHA + 90 * DIA;
    let anulado = hash(e, 1);
    p.client.registrar(&p.taller, &placa(e, "COR005"), &anulado, &pre, &FECHA, &hasta);
    p.client.anular_expediente(&anulado, &motivo(e, "Fraude"));
    assert_eq!(
        p.client.try_corregir_expediente(&p.taller, &anulado, &hash(e, 2), &pre, &FECHA, &hasta, &motivo(e, "Ocultar")),
        Err(Ok(Error::ExpedienteAnulado))
    );

    let vigente = hash(e, 3);
    p.client.registrar(&p.taller, &placa(e, "COR006"), &vigente, &pre, &FECHA, &hasta);
    p.client.suspender_taller(&p.taller);
    assert_eq!(
        p.client.try_corregir_expediente(&p.taller, &vigente, &hash(e, 4), &pre, &FECHA, &hasta, &motivo(e, "Corrección")),
        Err(Ok(Error::TallerNoAprobado))
    );
    assert_eq!(p.client.correccion(&vigente), None);
}

// ── v3: reportes, cofirma, custodia y lote ──

fn con_unidad(p: &Prueba) -> String {
    p.client.aprobar_taller(&p.taller);
    let pl = placa(&p.env, "ABC123");
    p.client.registrar(&p.taller, &pl, &hash(&p.env, 1), &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    pl
}

#[test]
fn tres_reportes_ponen_la_unidad_en_revision() {
    let p = preparar();
    let pl = con_unidad(&p);
    let ev = hash(&p.env, 50);
    for i in 1..=3u32 {
        let pasajero = Address::generate(&p.env);
        assert_eq!(p.client.reportar_falla(&pasajero, &pl, &ev), i);
        assert_eq!(p.client.revision(&pl).unwrap().en_revision, i >= 3);
    }
    assert_eq!(p.client.revision(&pl).unwrap().reportes, 3);
}

#[test]
fn reportar_exige_firma_del_pasajero() {
    let p = preparar();
    let pl = con_unidad(&p);
    let pasajero = Address::generate(&p.env);
    p.client.reportar_falla(&pasajero, &pl, &hash(&p.env, 50));
    let auths = p.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, pasajero);
}

#[test]
fn un_reporte_por_pasajero_y_dia() {
    let p = preparar();
    let pl = con_unidad(&p);
    let pasajero = Address::generate(&p.env);
    p.client.reportar_falla(&pasajero, &pl, &hash(&p.env, 50));
    assert_eq!(p.client.try_reportar_falla(&pasajero, &pl, &hash(&p.env, 51)), Err(Ok(Error::ReporteRepetido)));
    // Al día siguiente sí cuenta.
    p.env.ledger().set_timestamp(FECHA + 2 * DIA);
    assert_eq!(p.client.reportar_falla(&pasajero, &pl, &hash(&p.env, 51)), 2);
}

#[test]
fn no_se_reporta_una_placa_sin_registro() {
    let p = preparar();
    let r = p.client.try_reportar_falla(&Address::generate(&p.env), &placa(&p.env, "ZZZ999"), &hash(&p.env, 50));
    assert_eq!(r, Err(Ok(Error::PlacaSinRegistro)));
}

#[test]
fn el_taller_atiende_con_un_servicio_nuevo() {
    let p = preparar();
    let pl = con_unidad(&p);
    for _ in 0..3 {
        p.client.reportar_falla(&Address::generate(&p.env), &pl, &hash(&p.env, 50));
    }
    // El servicio de antes de los reportes no sirve.
    assert_eq!(p.client.try_atender_reporte(&p.taller, &pl, &hash(&p.env, 1)), Err(Ok(Error::ExpedienteAnterior)));

    p.env.ledger().set_sequence_number(p.env.ledger().sequence() + 10);
    let nuevo = hash(&p.env, 2);
    p.client.registrar(&p.taller, &pl, &nuevo, &tipo(&p.env, "correctivo"), &(FECHA + DIA), &(FECHA + 31 * DIA));
    p.client.atender_reporte(&p.taller, &pl, &nuevo);
    assert_eq!(p.client.revision(&pl), None);
    assert_eq!(p.client.try_atender_reporte(&p.taller, &pl, &nuevo), Err(Ok(Error::SinReportes)));
}

#[test]
fn atender_valida_placa_taller_y_anulacion() {
    let p = preparar();
    let pl = con_unidad(&p);
    p.client.reportar_falla(&Address::generate(&p.env), &pl, &hash(&p.env, 50));

    // Expediente de otra placa.
    p.client.registrar(&p.taller, &placa(&p.env, "OTRA1"), &hash(&p.env, 3), &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    assert_eq!(p.client.try_atender_reporte(&p.taller, &pl, &hash(&p.env, 3)), Err(Ok(Error::ExpedienteDeOtraPlaca)));

    // Expediente de otro taller.
    let otro = Address::generate(&p.env);
    p.client.aprobar_taller(&otro);
    p.client.registrar(&otro, &pl, &hash(&p.env, 4), &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    assert_eq!(p.client.try_atender_reporte(&p.taller, &pl, &hash(&p.env, 4)), Err(Ok(Error::NoEsDelTaller)));

    // Expediente anulado.
    p.client.registrar(&p.taller, &pl, &hash(&p.env, 5), &tipo(&p.env, "preventivo"), &FECHA, &(FECHA + 90 * DIA));
    p.client.anular_expediente(&hash(&p.env, 5), &motivo(&p.env, "Datos falsos"));
    assert_eq!(p.client.try_atender_reporte(&p.taller, &pl, &hash(&p.env, 5)), Err(Ok(Error::ExpedienteAnulado)));

    // Taller suspendido.
    p.client.suspender_taller(&p.taller);
    assert_eq!(p.client.try_atender_reporte(&p.taller, &pl, &hash(&p.env, 1)), Err(Ok(Error::TallerNoAprobado)));
}

#[test]
fn otro_taller_cofirma_una_sola_vez() {
    let p = preparar();
    con_unidad(&p);
    let h = hash(&p.env, 1);
    let inspector = Address::generate(&p.env);

    // Sin aprobar no puede.
    assert_eq!(p.client.try_cofirmar_expediente(&inspector, &h), Err(Ok(Error::TallerNoAprobado)));
    p.client.aprobar_taller(&inspector);
    // El mismo taller no se avala a sí mismo.
    assert_eq!(p.client.try_cofirmar_expediente(&p.taller, &h), Err(Ok(Error::MismoTaller)));

    p.client.cofirmar_expediente(&inspector, &h);
    assert_eq!(p.client.cofirma(&h).unwrap().inspector, inspector);
    assert_eq!(p.client.try_cofirmar_expediente(&inspector, &h), Err(Ok(Error::YaCofirmado)));
    assert_eq!(p.client.try_cofirmar_expediente(&inspector, &hash(&p.env, 9)), Err(Ok(Error::ExpedienteNoExiste)));
}

#[test]
fn no_se_cofirma_un_expediente_anulado() {
    let p = preparar();
    con_unidad(&p);
    let inspector = Address::generate(&p.env);
    p.client.aprobar_taller(&inspector);
    p.client.anular_expediente(&hash(&p.env, 1), &motivo(&p.env, "Datos falsos"));
    assert_eq!(p.client.try_cofirmar_expediente(&inspector, &hash(&p.env, 1)), Err(Ok(Error::ExpedienteAnulado)));
}

#[test]
fn el_custodio_transfiere_la_unidad() {
    let p = preparar();
    let pl = con_unidad(&p);
    assert_eq!(p.client.custodio(&pl), Some(p.taller.clone()));

    let nuevo = Address::generate(&p.env);
    assert_eq!(p.client.try_transferir_unidad(&p.taller, &pl, &nuevo), Err(Ok(Error::TallerNoAprobado)));
    p.client.aprobar_taller(&nuevo);
    assert_eq!(p.client.try_transferir_unidad(&p.taller, &pl, &p.taller), Err(Ok(Error::MismoTaller)));

    p.client.transferir_unidad(&p.taller, &pl, &nuevo);
    assert_eq!(p.client.custodio(&pl), Some(nuevo.clone()));
    // El anterior ya no puede transferirla.
    assert_eq!(p.client.try_transferir_unidad(&p.taller, &pl, &nuevo), Err(Ok(Error::NoEsCustodio)));
    // El nuevo sí.
    p.client.transferir_unidad(&nuevo, &pl, &p.taller);
    assert_eq!(p.client.custodio(&pl), Some(p.taller.clone()));
}

#[test]
fn transferir_una_placa_sin_registro_falla() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let r = p.client.try_transferir_unidad(&p.taller, &placa(&p.env, "ZZZ999"), &Address::generate(&p.env));
    assert_eq!(r, Err(Ok(Error::PlacaSinRegistro)));
}

fn exp_lote(env: &Env, pl: &str, n: u8) -> ExpedienteLote {
    ExpedienteLote { placa: placa(env, pl), hash: hash(env, n), tipo: tipo(env, "preventivo"), fecha: FECHA, vigente_hasta: FECHA + 90 * DIA }
}

#[test]
fn registrar_lote_guarda_todos() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let lote = soroban_sdk::vec![&p.env, exp_lote(&p.env, "LOTE1", 11), exp_lote(&p.env, "LOTE2", 12), exp_lote(&p.env, "LOTE3", 13)];
    assert_eq!(p.client.registrar_lote(&p.taller, &lote), 3);
    // Una sola firma, la del taller, para todo el lote.
    let auths = p.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, p.taller);
    for (pl, n) in [("LOTE1", 11), ("LOTE2", 12), ("LOTE3", 13)] {
        assert_eq!(p.client.estado(&placa(&p.env, pl)).unwrap().hash, hash(&p.env, n));
    }
}

#[test]
fn si_uno_del_lote_falla_no_se_guarda_ninguno() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let mut malo = exp_lote(&p.env, "LOTE2", 12);
    malo.tipo = tipo(&p.env, "inventado");
    let lote = soroban_sdk::vec![&p.env, exp_lote(&p.env, "LOTE1", 11), malo];
    assert_eq!(p.client.try_registrar_lote(&p.taller, &lote), Err(Ok(Error::TipoInvalido)));
    assert_eq!(p.client.expediente(&hash(&p.env, 11)), None);
    assert_eq!(p.client.estado(&placa(&p.env, "LOTE1")), None);

    // Hash repetido dentro del mismo lote.
    let rep = soroban_sdk::vec![&p.env, exp_lote(&p.env, "LOTE1", 11), exp_lote(&p.env, "LOTE2", 11)];
    assert_eq!(p.client.try_registrar_lote(&p.taller, &rep), Err(Ok(Error::ExpedienteDuplicado)));
    assert_eq!(p.client.expediente(&hash(&p.env, 11)), None);
}

#[test]
fn el_lote_no_puede_ir_vacio_ni_pasar_de_10() {
    let p = preparar();
    p.client.aprobar_taller(&p.taller);
    let vacio: Vec<ExpedienteLote> = Vec::new(&p.env);
    assert_eq!(p.client.try_registrar_lote(&p.taller, &vacio), Err(Ok(Error::LoteInvalido)));
    let mut grande = Vec::new(&p.env);
    for n in 0..11u8 {
        grande.push_back(exp_lote(&p.env, "LOTE1", 100 + n));
    }
    assert_eq!(p.client.try_registrar_lote(&p.taller, &grande), Err(Ok(Error::LoteInvalido)));
}
