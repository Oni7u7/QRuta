//! Flota de QRuta: el contrato del socio propietario de las unidades.
//!
//! Se apoya en el contrato `qruta-registry` (expedientes, talleres aprobados, operadores y revisiones):
//! una unidad solo entra a una ruta si está vigente, un operador solo arranca la jornada si la unidad
//! no está en revisión, y un pago o una garantía siempre van al taller que firmó el expediente.
//!
//! - Socios y unidades: alta del socio, alta, baja y venta de unidades.
//! - Rutas y jornadas: rutas del admin, asignación de unidades y jornadas del operador.
//! - Fondo de mantenimiento en XLM: depósito, pago al taller por expediente y retiro.
//! - Garantías del taller sobre un servicio, calificaciones de talleres y multas a las unidades.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN, Env,
    String, Symbol,
};

const DIA: u64 = 86_400;
const DIA_EN_LEDGERS: u32 = 17_280;
const TTL_UMBRAL: u32 = 30 * DIA_EN_LEDGERS;
const TTL_EXTENDER: u32 = 120 * DIA_EN_LEDGERS;
const GARANTIA_MAXIMA_DIAS: u32 = 90;

// ── Interfaz del contrato qruta-registry (mismos tipos que allá) ──

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registro {
    pub placa: String,
    pub taller: Address,
    pub tipo: Symbol,
    pub fecha: u64,
    pub vigente_hasta: u64,
    pub ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EstadoUnidad {
    pub hash: BytesN<32>,
    pub registro: Registro,
    pub vigente: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Revision {
    pub reportes: u32,
    pub en_revision: bool,
    pub desde_ledger: u32,
    pub ultima_evidencia: BytesN<32>,
}

#[allow(dead_code)]
#[contractclient(name = "RegistroClient")]
pub trait Registry {
    fn estado(env: Env, placa: String) -> Option<EstadoUnidad>;
    fn expediente(env: Env, hash: BytesN<32>) -> Option<Registro>;
    fn es_aprobado(env: Env, taller: Address) -> bool;
    fn revision(env: Env, placa: String) -> Option<Revision>;
    fn operador(env: Env, placa: String) -> Option<Address>;
}

// ── Datos de la flota ──

#[contracttype]
#[derive(Clone)]
enum Clave {
    Admin,
    Registro,
    Token,
    Socio(Address),
    Dueno(String),
    Ruta(String),
    RutaDe(String),
    Jornada(String),
    UltimoKm(String),
    Totales(String),
    Fondo(Address),
    Pagado(BytesN<32>),
    Garantia(BytesN<32>),
    Calificado(BytesN<32>),
    Reputacion(Address),
    Multa(String, u32),
    SiguienteMulta(String),
    MultasPendientes(String),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Socio {
    pub huella_rfc: BytesN<32>,
    pub unidades: u32,
    pub ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Ruta {
    pub nombre: String,
    pub abierta: bool,
    pub unidades: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Jornada {
    pub operador: Address,
    pub inicio: u64,
}

/// Lo acumulado por una unidad en sus jornadas.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Totales {
    pub jornadas: u32,
    pub segundos: u64,
    pub km: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pago {
    pub socio: Address,
    pub taller: Address,
    pub monto: i128,
}

/// Estados de una garantía.
pub const GARANTIA_SIN_RECLAMO: u32 = 0;
pub const GARANTIA_RECLAMADA: u32 = 1;
pub const GARANTIA_ACEPTADA: u32 = 2;
pub const GARANTIA_RECHAZADA: u32 = 3;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Garantia {
    pub taller: Address,
    pub placa: String,
    pub hasta: u64,
    pub estado: u32,
    /// Huella de la evidencia del último reclamo (ceros si nunca se reclamó).
    pub evidencia: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reputacion {
    pub suma: u32,
    pub calificaciones: u32,
}

/// Estados de una multa.
pub const MULTA_PENDIENTE: u32 = 0;
pub const MULTA_PAGADA: u32 = 1;
pub const MULTA_CANCELADA: u32 = 2;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Multa {
    pub monto: i128,
    pub motivo: String,
    pub estado: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    YaRegistrado = 1,
    EsTaller = 2,
    NoEsSocio = 3,
    PlacaSinRegistro = 4,
    UnidadConDueno = 5,
    NoEsDueno = 6,
    MotivoInvalido = 7,
    TieneRuta = 8,
    JornadaAbierta = 9,
    MultasPendientes = 10,
    MismoSocio = 11,
    DatoInvalido = 12,
    RutaExiste = 13,
    RutaNoDisponible = 14,
    UnidadNoVigente = 15,
    RutaYaAsignada = 16,
    SinRuta = 17,
    RutaConUnidades = 18,
    NoEsOperador = 19,
    UnidadSinFlota = 20,
    UnidadEnRevision = 21,
    SinJornada = 22,
    KilometrajeInvalido = 23,
    MontoInvalido = 24,
    ExpedienteNoExiste = 25,
    YaPagado = 26,
    SaldoInsuficiente = 27,
    NoEsDelTaller = 28,
    TallerNoAprobado = 29,
    GarantiaExiste = 30,
    SinGarantia = 31,
    GarantiaVencida = 32,
    ReclamoAbierto = 33,
    SinReclamo = 34,
    YaCalificado = 35,
    SinMulta = 36,
    MultaNoPendiente = 37,
}

/// Un evento por operación: `accion` dice qué pasó, `cuenta` quién lo hizo y `placa`/`monto` el detalle.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Flota {
    #[topic]
    pub accion: Symbol,
    pub cuenta: Address,
    pub placa: String,
    pub monto: i128,
}

#[contract]
pub struct QrutaFlota;

// ── Utilidades ──

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&Clave::Admin).unwrap()
}

fn registro(env: &Env) -> RegistroClient<'_> {
    let id: Address = env.storage().instance().get(&Clave::Registro).unwrap();
    RegistroClient::new(env, &id)
}

fn xlm(env: &Env) -> token::Client<'_> {
    let id: Address = env.storage().instance().get(&Clave::Token).unwrap();
    token::Client::new(env, &id)
}

fn guardar<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, clave: &Clave, valor: &V) {
    env.storage().persistent().set(clave, valor);
    env.storage().persistent().extend_ttl(clave, TTL_UMBRAL, TTL_EXTENDER);
}

fn leer<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, clave: &Clave) -> Option<V> {
    env.storage().persistent().get(clave)
}

fn hay(env: &Env, clave: &Clave) -> bool {
    env.storage().persistent().has(clave)
}

fn evento(env: &Env, accion: &str, cuenta: &Address, placa: &String, monto: i128) {
    env.storage().instance().extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
    Flota { accion: Symbol::new(env, accion), cuenta: cuenta.clone(), placa: placa.clone(), monto }.publish(env);
}

fn sin_placa(env: &Env) -> String {
    String::from_str(env, "")
}

fn motivo_valido(motivo: &String) -> bool {
    motivo.len() >= 3 && motivo.len() <= 200
}

fn socio(env: &Env, cuenta: &Address) -> Result<Socio, Error> {
    leer(env, &Clave::Socio(cuenta.clone())).ok_or(Error::NoEsSocio)
}

/// Exige que `socio` sea el dueño registrado de la placa.
fn exigir_dueno(env: &Env, cuenta: &Address, placa: &String) -> Result<(), Error> {
    match leer::<Address>(env, &Clave::Dueno(placa.clone())) {
        Some(d) if d == *cuenta => Ok(()),
        _ => Err(Error::NoEsDueno),
    }
}

fn multas_pendientes(env: &Env, placa: &String) -> u32 {
    leer(env, &Clave::MultasPendientes(placa.clone())).unwrap_or(0)
}

fn unidad_vigente(env: &Env, placa: &String) -> bool {
    registro(env).estado(placa).is_some_and(|e| e.vigente)
}

fn fondo(env: &Env, cuenta: &Address) -> i128 {
    leer(env, &Clave::Fondo(cuenta.clone())).unwrap_or(0)
}

fn cambiar_unidades(env: &Env, cuenta: &Address, suma: bool) {
    let clave = Clave::Socio(cuenta.clone());
    if let Some(mut s) = leer::<Socio>(env, &clave) {
        s.unidades = if suma { s.unidades + 1 } else { s.unidades.saturating_sub(1) };
        guardar(env, &clave, &s);
    }
}

fn cambiar_unidades_ruta(env: &Env, codigo: &String, suma: bool) {
    let clave = Clave::Ruta(codigo.clone());
    if let Some(mut r) = leer::<Ruta>(env, &clave) {
        r.unidades = if suma { r.unidades + 1 } else { r.unidades.saturating_sub(1) };
        guardar(env, &clave, &r);
    }
}

/// Expediente del registro cuya placa pertenece al socio.
fn expediente_del_socio(env: &Env, cuenta: &Address, hash: &BytesN<32>) -> Result<Registro, Error> {
    let reg = registro(env).expediente(hash).ok_or(Error::ExpedienteNoExiste)?;
    exigir_dueno(env, cuenta, &reg.placa)?;
    Ok(reg)
}

#[contractimpl]
impl QrutaFlota {
    /// `registro`: contrato qruta-registry. `token`: activo del fondo y de las multas (XLM nativo).
    pub fn __constructor(env: Env, admin: Address, registro: Address, token: Address) {
        env.storage().instance().set(&Clave::Admin, &admin);
        env.storage().instance().set(&Clave::Registro, &registro);
        env.storage().instance().set(&Clave::Token, &token);
        env.storage().instance().extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
    }

    // ── Socios y unidades ──

    /// Alta del socio propietario con la huella de su RFC. Una cuenta por socio; un taller no puede ser socio.
    pub fn registrar_socio(env: Env, socio: Address, huella_rfc: BytesN<32>) -> Result<(), Error> {
        socio.require_auth();
        let clave = Clave::Socio(socio.clone());
        if hay(&env, &clave) {
            return Err(Error::YaRegistrado);
        }
        if registro(&env).es_aprobado(&socio) {
            return Err(Error::EsTaller);
        }
        guardar(&env, &clave, &Socio { huella_rfc, unidades: 0, ledger: env.ledger().sequence() });
        evento(&env, "socio_registrado", &socio, &sin_placa(&env), 0);
        Ok(())
    }

    /// El socio da de alta una unidad suya. La placa debe tener servicios en el registro y no ser de otro socio.
    pub fn alta_unidad(env: Env, socio: Address, placa: String) -> Result<u32, Error> {
        socio.require_auth();
        let mut datos = self::socio(&env, &socio)?;
        if registro(&env).estado(&placa).is_none() {
            return Err(Error::PlacaSinRegistro);
        }
        let clave = Clave::Dueno(placa.clone());
        if hay(&env, &clave) {
            return Err(Error::UnidadConDueno);
        }
        guardar(&env, &clave, &socio);
        datos.unidades += 1;
        guardar(&env, &Clave::Socio(socio.clone()), &datos);
        evento(&env, "unidad_alta", &socio, &placa, 0);
        Ok(datos.unidades)
    }

    /// El dueño saca una unidad de su flota. Solo si no tiene ruta, jornada abierta ni multas pendientes.
    pub fn baja_unidad_flota(env: Env, socio: Address, placa: String, motivo: String) -> Result<(), Error> {
        socio.require_auth();
        exigir_dueno(&env, &socio, &placa)?;
        if !motivo_valido(&motivo) {
            return Err(Error::MotivoInvalido);
        }
        if hay(&env, &Clave::RutaDe(placa.clone())) {
            return Err(Error::TieneRuta);
        }
        if hay(&env, &Clave::Jornada(placa.clone())) {
            return Err(Error::JornadaAbierta);
        }
        if multas_pendientes(&env, &placa) > 0 {
            return Err(Error::MultasPendientes);
        }
        env.storage().persistent().remove(&Clave::Dueno(placa.clone()));
        cambiar_unidades(&env, &socio, false);
        evento(&env, "unidad_baja", &socio, &placa, 0);
        Ok(())
    }

    /// El dueño vende la unidad a otro socio registrado. No se vende con multas pendientes.
    pub fn transferir_propiedad(env: Env, socio: Address, placa: String, nuevo: Address) -> Result<(), Error> {
        socio.require_auth();
        exigir_dueno(&env, &socio, &placa)?;
        if nuevo == socio {
            return Err(Error::MismoSocio);
        }
        self::socio(&env, &nuevo)?;
        if multas_pendientes(&env, &placa) > 0 {
            return Err(Error::MultasPendientes);
        }
        guardar(&env, &Clave::Dueno(placa.clone()), &nuevo);
        cambiar_unidades(&env, &socio, false);
        cambiar_unidades(&env, &nuevo, true);
        evento(&env, "unidad_vendida", &nuevo, &placa, 0);
        Ok(())
    }

    // ── Rutas y jornadas ──

    /// El admin abre una ruta: código de 2 a 10 caracteres, único, y nombre de 3 a 60.
    pub fn crear_ruta(env: Env, codigo: String, nombre: String) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        if codigo.len() < 2 || codigo.len() > 10 || nombre.len() < 3 || nombre.len() > 60 {
            return Err(Error::DatoInvalido);
        }
        let clave = Clave::Ruta(codigo.clone());
        if hay(&env, &clave) {
            return Err(Error::RutaExiste);
        }
        guardar(&env, &clave, &Ruta { nombre, abierta: true, unidades: 0 });
        evento(&env, "ruta_creada", &admin, &codigo, 0);
        Ok(())
    }

    /// El dueño pone la unidad en una ruta abierta. La unidad debe estar vigente en el registro.
    /// Si ya estaba en otra ruta, se mueve. Devuelve las unidades de la ruta.
    pub fn asignar_ruta(env: Env, socio: Address, placa: String, ruta: String) -> Result<u32, Error> {
        socio.require_auth();
        exigir_dueno(&env, &socio, &placa)?;
        let datos: Ruta = leer(&env, &Clave::Ruta(ruta.clone())).ok_or(Error::RutaNoDisponible)?;
        if !datos.abierta {
            return Err(Error::RutaNoDisponible);
        }
        if !unidad_vigente(&env, &placa) {
            return Err(Error::UnidadNoVigente);
        }
        let clave = Clave::RutaDe(placa.clone());
        match leer::<String>(&env, &clave) {
            Some(actual) if actual == ruta => return Err(Error::RutaYaAsignada),
            Some(actual) => cambiar_unidades_ruta(&env, &actual, false),
            None => {}
        }
        guardar(&env, &clave, &ruta);
        cambiar_unidades_ruta(&env, &ruta, true);
        evento(&env, "ruta_asignada", &socio, &placa, 0);
        Ok(datos.unidades + 1)
    }

    /// El dueño saca la unidad de su ruta.
    pub fn desasignar_ruta(env: Env, socio: Address, placa: String) -> Result<(), Error> {
        socio.require_auth();
        exigir_dueno(&env, &socio, &placa)?;
        let clave = Clave::RutaDe(placa.clone());
        let ruta: String = leer(&env, &clave).ok_or(Error::SinRuta)?;
        env.storage().persistent().remove(&clave);
        cambiar_unidades_ruta(&env, &ruta, false);
        evento(&env, "ruta_desasignada", &socio, &placa, 0);
        Ok(())
    }

    /// El admin cierra una ruta abierta que ya no tiene unidades.
    pub fn cerrar_ruta(env: Env, codigo: String) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        let clave = Clave::Ruta(codigo.clone());
        let mut ruta: Ruta = leer(&env, &clave).ok_or(Error::RutaNoDisponible)?;
        if !ruta.abierta {
            return Err(Error::RutaNoDisponible);
        }
        if ruta.unidades > 0 {
            return Err(Error::RutaConUnidades);
        }
        ruta.abierta = false;
        guardar(&env, &clave, &ruta);
        evento(&env, "ruta_cerrada", &admin, &codigo, 0);
        Ok(())
    }

    /// El operador asignado en el registro arranca su jornada. La unidad debe ser de una flota,
    /// estar vigente, no estar en revisión y no tener otra jornada abierta.
    pub fn iniciar_jornada(env: Env, operador: Address, placa: String) -> Result<(), Error> {
        operador.require_auth();
        let reg = registro(&env);
        if reg.operador(&placa) != Some(operador.clone()) {
            return Err(Error::NoEsOperador);
        }
        if !hay(&env, &Clave::Dueno(placa.clone())) {
            return Err(Error::UnidadSinFlota);
        }
        if !reg.estado(&placa).is_some_and(|e| e.vigente) {
            return Err(Error::UnidadNoVigente);
        }
        if reg.revision(&placa).is_some_and(|r| r.en_revision) {
            return Err(Error::UnidadEnRevision);
        }
        let clave = Clave::Jornada(placa.clone());
        if hay(&env, &clave) {
            return Err(Error::JornadaAbierta);
        }
        guardar(&env, &clave, &Jornada { operador: operador.clone(), inicio: env.ledger().timestamp() });
        evento(&env, "jornada_iniciada", &operador, &placa, 0);
        Ok(())
    }

    /// Quien abrió la jornada la cierra con la lectura del odómetro (no puede bajar).
    /// Suma la jornada, su duración y los km recorridos. Devuelve los km de esta jornada.
    pub fn terminar_jornada(env: Env, operador: Address, placa: String, km: u64) -> Result<u64, Error> {
        operador.require_auth();
        let clave = Clave::Jornada(placa.clone());
        let jornada: Jornada = leer(&env, &clave).ok_or(Error::SinJornada)?;
        if jornada.operador != operador {
            return Err(Error::NoEsOperador);
        }
        let clave_km = Clave::UltimoKm(placa.clone());
        let recorridos = match leer::<u64>(&env, &clave_km) {
            Some(ultimo) if km < ultimo => return Err(Error::KilometrajeInvalido),
            Some(ultimo) => km - ultimo,
            None => 0,
        };
        let clave_tot = Clave::Totales(placa.clone());
        let mut tot = leer::<Totales>(&env, &clave_tot).unwrap_or(Totales { jornadas: 0, segundos: 0, km: 0 });
        tot.jornadas += 1;
        tot.segundos += env.ledger().timestamp().saturating_sub(jornada.inicio);
        tot.km += recorridos;
        guardar(&env, &clave_tot, &tot);
        guardar(&env, &clave_km, &km);
        env.storage().persistent().remove(&clave);
        evento(&env, "jornada_terminada", &operador, &placa, recorridos as i128);
        Ok(recorridos)
    }

    // ── Fondo de mantenimiento ──

    /// El socio deposita XLM en su fondo de mantenimiento. Devuelve su saldo.
    pub fn depositar_fondo(env: Env, socio: Address, monto: i128) -> Result<i128, Error> {
        socio.require_auth();
        self::socio(&env, &socio)?;
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        xlm(&env).transfer(&socio, env.current_contract_address(), &monto);
        let saldo = fondo(&env, &socio) + monto;
        guardar(&env, &Clave::Fondo(socio.clone()), &saldo);
        evento(&env, "fondo_deposito", &socio, &sin_placa(&env), monto);
        Ok(saldo)
    }

    /// El socio paga con su fondo un servicio de una unidad suya. El pago va al taller que firmó
    /// el expediente en el registro y cada expediente se paga una sola vez. Devuelve el saldo que queda.
    pub fn pagar_servicio(env: Env, socio: Address, hash: BytesN<32>, monto: i128) -> Result<i128, Error> {
        socio.require_auth();
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        let reg = expediente_del_socio(&env, &socio, &hash)?;
        let clave = Clave::Pagado(hash.clone());
        if hay(&env, &clave) {
            return Err(Error::YaPagado);
        }
        let saldo = fondo(&env, &socio);
        if saldo < monto {
            return Err(Error::SaldoInsuficiente);
        }
        xlm(&env).transfer(&env.current_contract_address(), &reg.taller, &monto);
        guardar(&env, &Clave::Fondo(socio.clone()), &(saldo - monto));
        guardar(&env, &clave, &Pago { socio: socio.clone(), taller: reg.taller, monto });
        evento(&env, "servicio_pagado", &socio, &reg.placa, monto);
        Ok(saldo - monto)
    }

    /// El socio retira XLM de su fondo. Devuelve el saldo que queda.
    pub fn retirar_fondo(env: Env, socio: Address, monto: i128) -> Result<i128, Error> {
        socio.require_auth();
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        let saldo = fondo(&env, &socio);
        if saldo < monto {
            return Err(Error::SaldoInsuficiente);
        }
        xlm(&env).transfer(&env.current_contract_address(), &socio, &monto);
        guardar(&env, &Clave::Fondo(socio.clone()), &(saldo - monto));
        evento(&env, "fondo_retiro", &socio, &sin_placa(&env), monto);
        Ok(saldo - monto)
    }

    // ── Garantías ──

    /// El taller que firmó un expediente da garantía sobre ese servicio (1 a 90 días, una por expediente).
    /// Devuelve la fecha en que vence.
    pub fn emitir_garantia(env: Env, taller: Address, hash: BytesN<32>, dias: u32) -> Result<u64, Error> {
        taller.require_auth();
        let reg = registro(&env);
        let exp = reg.expediente(&hash).ok_or(Error::ExpedienteNoExiste)?;
        if exp.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if !reg.es_aprobado(&taller) {
            return Err(Error::TallerNoAprobado);
        }
        if dias == 0 || dias > GARANTIA_MAXIMA_DIAS {
            return Err(Error::DatoInvalido);
        }
        let clave = Clave::Garantia(hash.clone());
        if hay(&env, &clave) {
            return Err(Error::GarantiaExiste);
        }
        let hasta = env.ledger().timestamp() + dias as u64 * DIA;
        let garantia = Garantia {
            taller: taller.clone(),
            placa: exp.placa.clone(),
            hasta,
            estado: GARANTIA_SIN_RECLAMO,
            evidencia: BytesN::from_array(&env, &[0; 32]),
        };
        guardar(&env, &clave, &garantia);
        evento(&env, "garantia_emitida", &taller, &exp.placa, dias as i128);
        Ok(hasta)
    }

    /// El dueño de la unidad reclama la garantía con la huella de su evidencia, mientras esté vigente
    /// y sin otro reclamo abierto.
    pub fn reclamar_garantia(env: Env, socio: Address, hash: BytesN<32>, evidencia: BytesN<32>) -> Result<(), Error> {
        socio.require_auth();
        let clave = Clave::Garantia(hash.clone());
        let mut g: Garantia = leer(&env, &clave).ok_or(Error::SinGarantia)?;
        exigir_dueno(&env, &socio, &g.placa)?;
        if env.ledger().timestamp() > g.hasta {
            return Err(Error::GarantiaVencida);
        }
        if g.estado == GARANTIA_RECLAMADA {
            return Err(Error::ReclamoAbierto);
        }
        g.estado = GARANTIA_RECLAMADA;
        g.evidencia = evidencia;
        guardar(&env, &clave, &g);
        evento(&env, "garantia_reclamada", &socio, &g.placa, 0);
        Ok(())
    }

    /// El taller que dio la garantía acepta o rechaza el reclamo abierto.
    pub fn resolver_garantia(env: Env, taller: Address, hash: BytesN<32>, aceptada: bool) -> Result<(), Error> {
        taller.require_auth();
        let clave = Clave::Garantia(hash.clone());
        let mut g: Garantia = leer(&env, &clave).ok_or(Error::SinGarantia)?;
        if g.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if g.estado != GARANTIA_RECLAMADA {
            return Err(Error::SinReclamo);
        }
        g.estado = if aceptada { GARANTIA_ACEPTADA } else { GARANTIA_RECHAZADA };
        guardar(&env, &clave, &g);
        evento(&env, if aceptada { "garantia_aceptada" } else { "garantia_rechazada" }, &taller, &g.placa, 0);
        Ok(())
    }

    // ── Calificaciones y multas ──

    /// El dueño de la unidad califica al taller por un servicio (1 a 5, una vez por expediente).
    /// Devuelve el promedio del taller multiplicado por 100 (450 = 4.5 estrellas).
    pub fn calificar_taller(env: Env, socio: Address, hash: BytesN<32>, estrellas: u32) -> Result<u32, Error> {
        socio.require_auth();
        if !(1..=5).contains(&estrellas) {
            return Err(Error::DatoInvalido);
        }
        let reg = expediente_del_socio(&env, &socio, &hash)?;
        let clave = Clave::Calificado(hash.clone());
        if hay(&env, &clave) {
            return Err(Error::YaCalificado);
        }
        guardar(&env, &clave, &estrellas);
        let clave_rep = Clave::Reputacion(reg.taller.clone());
        let mut rep = leer::<Reputacion>(&env, &clave_rep).unwrap_or(Reputacion { suma: 0, calificaciones: 0 });
        rep.suma += estrellas;
        rep.calificaciones += 1;
        guardar(&env, &clave_rep, &rep);
        evento(&env, "taller_calificado", &socio, &reg.placa, estrellas as i128);
        Ok(rep.suma * 100 / rep.calificaciones)
    }

    /// El admin multa a una unidad de una flota. Devuelve el número de la multa.
    pub fn registrar_multa(env: Env, placa: String, monto: i128, motivo: String) -> Result<u32, Error> {
        let admin = admin(&env);
        admin.require_auth();
        if !hay(&env, &Clave::Dueno(placa.clone())) {
            return Err(Error::UnidadSinFlota);
        }
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        if !motivo_valido(&motivo) {
            return Err(Error::MotivoInvalido);
        }
        let clave_sig = Clave::SiguienteMulta(placa.clone());
        let id: u32 = leer(&env, &clave_sig).unwrap_or(0);
        guardar(&env, &Clave::Multa(placa.clone(), id), &Multa { monto, motivo, estado: MULTA_PENDIENTE });
        guardar(&env, &clave_sig, &(id + 1));
        guardar(&env, &Clave::MultasPendientes(placa.clone()), &(multas_pendientes(&env, &placa) + 1));
        evento(&env, "multa_registrada", &admin, &placa, monto);
        Ok(id)
    }

    /// El dueño paga una multa pendiente: los XLM van a la cuenta admin (tesorería).
    pub fn pagar_multa(env: Env, socio: Address, placa: String, id: u32) -> Result<(), Error> {
        socio.require_auth();
        exigir_dueno(&env, &socio, &placa)?;
        let clave = Clave::Multa(placa.clone(), id);
        let mut multa: Multa = leer(&env, &clave).ok_or(Error::SinMulta)?;
        if multa.estado != MULTA_PENDIENTE {
            return Err(Error::MultaNoPendiente);
        }
        xlm(&env).transfer(&socio, admin(&env), &multa.monto);
        multa.estado = MULTA_PAGADA;
        guardar(&env, &clave, &multa);
        guardar(&env, &Clave::MultasPendientes(placa.clone()), &multas_pendientes(&env, &placa).saturating_sub(1));
        evento(&env, "multa_pagada", &socio, &placa, multa.monto);
        Ok(())
    }

    /// El admin cancela una multa que sigue pendiente, con su motivo.
    pub fn cancelar_multa(env: Env, placa: String, id: u32, motivo: String) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        if !motivo_valido(&motivo) {
            return Err(Error::MotivoInvalido);
        }
        let clave = Clave::Multa(placa.clone(), id);
        let mut multa: Multa = leer(&env, &clave).ok_or(Error::SinMulta)?;
        if multa.estado != MULTA_PENDIENTE {
            return Err(Error::MultaNoPendiente);
        }
        multa.estado = MULTA_CANCELADA;
        multa.motivo = motivo;
        guardar(&env, &clave, &multa);
        guardar(&env, &Clave::MultasPendientes(placa.clone()), &multas_pendientes(&env, &placa).saturating_sub(1));
        evento(&env, "multa_cancelada", &admin, &placa, multa.monto);
        Ok(())
    }

    // ── Lecturas ──

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }

    pub fn socio(env: Env, cuenta: Address) -> Option<Socio> {
        leer(&env, &Clave::Socio(cuenta))
    }

    pub fn dueno(env: Env, placa: String) -> Option<Address> {
        leer(&env, &Clave::Dueno(placa))
    }

    pub fn ruta(env: Env, codigo: String) -> Option<Ruta> {
        leer(&env, &Clave::Ruta(codigo))
    }

    pub fn ruta_de(env: Env, placa: String) -> Option<String> {
        leer(&env, &Clave::RutaDe(placa))
    }

    pub fn jornada(env: Env, placa: String) -> Option<Jornada> {
        leer(&env, &Clave::Jornada(placa))
    }

    pub fn totales(env: Env, placa: String) -> Option<Totales> {
        leer(&env, &Clave::Totales(placa))
    }

    pub fn fondo(env: Env, socio: Address) -> i128 {
        fondo(&env, &socio)
    }

    pub fn pago(env: Env, hash: BytesN<32>) -> Option<Pago> {
        leer(&env, &Clave::Pagado(hash))
    }

    pub fn garantia(env: Env, hash: BytesN<32>) -> Option<Garantia> {
        leer(&env, &Clave::Garantia(hash))
    }

    pub fn reputacion(env: Env, taller: Address) -> Option<Reputacion> {
        leer(&env, &Clave::Reputacion(taller))
    }

    pub fn multa(env: Env, placa: String, id: u32) -> Option<Multa> {
        leer(&env, &Clave::Multa(placa, id))
    }
}

#[cfg(test)]
mod test;
