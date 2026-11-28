//! Taller de QRuta: órdenes de trabajo con pago en garantía, refacciones con trazabilidad y mecánicos certificados.
//!
//! Se apoya en `qruta-registry` (talleres aprobados y expedientes) y en `qruta-flota` (dueño de cada unidad):
//! - Solo el dueño de la unidad pide y paga una orden; el pago queda en este contrato hasta que acepta la entrega.
//! - El taller entrega con un expediente nuevo del registro, de esa placa y firmado por él.
//! - Una refacción solo la instala un mecánico del taller certificado en ese tipo de pieza.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN, Env,
    String, Symbol,
};

const DIA: u64 = 86_400;
const DIA_EN_LEDGERS: u32 = 17_280;
const TTL_UMBRAL: u32 = 30 * DIA_EN_LEDGERS;
const TTL_EXTENDER: u32 = 120 * DIA_EN_LEDGERS;
// Plazo de entrega de una cotización: de 1 minuto a 30 días.
const PLAZO_MAXIMO_MIN: u32 = 30 * 24 * 60;
const CERTIFICACION_MAXIMA_DIAS: u32 = 365;

// ── Interfaces de qruta-registry y qruta-flota ──

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

#[allow(dead_code)]
#[contractclient(name = "RegistroClient")]
pub trait Registry {
    fn expediente(env: Env, hash: BytesN<32>) -> Option<Registro>;
    fn es_aprobado(env: Env, taller: Address) -> bool;
}

#[allow(dead_code)]
#[contractclient(name = "FlotaClient")]
pub trait Flota {
    fn dueno(env: Env, placa: String) -> Option<Address>;
}

// ── Datos ──

#[contracttype]
#[derive(Clone)]
enum Clave {
    Admin,
    Registro,
    Flota,
    Token,
    SiguienteOrden,
    Orden(u32),
    Calificada(u32),
    Ganancias(Address),
    Retrasos(Address),
    Reputacion(Address),
    Pieza(BytesN<32>),
    MecanicoDe(Address),
    Certificacion(Address, Symbol),
}

pub const ORDEN_SOLICITADA: u32 = 0;
pub const ORDEN_COTIZADA: u32 = 1;
pub const ORDEN_ACEPTADA: u32 = 2;
pub const ORDEN_EN_PROCESO: u32 = 3;
pub const ORDEN_ENTREGADA: u32 = 4;
pub const ORDEN_CONFIRMADA: u32 = 5;
pub const ORDEN_DISPUTADA: u32 = 6;
pub const ORDEN_RESUELTA: u32 = 7;
pub const ORDEN_CANCELADA: u32 = 8;
pub const ORDEN_RECHAZADA: u32 = 9;
pub const ORDEN_REEMBOLSADA: u32 = 10;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Orden {
    pub socio: Address,
    pub taller: Address,
    pub placa: String,
    /// Huella de la descripción del trabajo (fuera de la cadena).
    pub descripcion: BytesN<32>,
    pub monto: i128,
    pub plazo_min: u32,
    /// Fecha límite de entrega (unix), fijada al iniciar el trabajo.
    pub compromiso: u64,
    pub estado: u32,
    /// Ledger en que el socio aceptó: el expediente de entrega debe ser posterior.
    pub aceptada_ledger: u32,
    /// Expediente con que se entregó, o huella de la evidencia de la disputa.
    pub huella: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reputacion {
    pub suma: u32,
    pub calificaciones: u32,
}

pub const PIEZA_EN_INVENTARIO: u32 = 0;
pub const PIEZA_INSTALADA: u32 = 1;
pub const PIEZA_RETIRADA: u32 = 2;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pieza {
    pub taller: Address,
    pub tipo: Symbol,
    pub estado: u32,
    /// Placa donde está instalada (vacía en inventario).
    pub placa: String,
    pub expediente: BytesN<32>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoEsDueno = 1,
    TallerNoAprobado = 2,
    MismaCuenta = 3,
    OrdenNoExiste = 4,
    NoEsDelTaller = 5,
    EstadoInvalido = 6,
    MontoInvalido = 7,
    PlazoInvalido = 8,
    NoEsDelSocio = 9,
    ExpedienteNoExiste = 10,
    ExpedienteDeOtraPlaca = 11,
    ServicioAnterior = 12,
    PorcentajeInvalido = 13,
    SinRetraso = 14,
    SaldoInsuficiente = 15,
    DatoInvalido = 16,
    YaCalificada = 17,
    PiezaExiste = 18,
    PiezaNoExiste = 19,
    NoEsMecanico = 20,
    NoCertificado = 21,
    MotivoInvalido = 22,
    MecanicoOcupado = 23,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Taller {
    #[topic]
    pub accion: Symbol,
    pub cuenta: Address,
    pub id: u32,
    pub monto: i128,
}

#[contract]
pub struct QrutaTaller;

// ── Utilidades ──

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&Clave::Admin).unwrap()
}

fn registro(env: &Env) -> RegistroClient<'_> {
    let id: Address = env.storage().instance().get(&Clave::Registro).unwrap();
    RegistroClient::new(env, &id)
}

fn flota(env: &Env) -> FlotaClient<'_> {
    let id: Address = env.storage().instance().get(&Clave::Flota).unwrap();
    FlotaClient::new(env, &id)
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

fn evento(env: &Env, accion: &str, cuenta: &Address, id: u32, monto: i128) {
    env.storage().instance().extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
    Taller { accion: Symbol::new(env, accion), cuenta: cuenta.clone(), id, monto }.publish(env);
}

fn orden(env: &Env, id: u32) -> Result<Orden, Error> {
    leer(env, &Clave::Orden(id)).ok_or(Error::OrdenNoExiste)
}

fn guardar_orden(env: &Env, id: u32, o: &Orden) {
    guardar(env, &Clave::Orden(id), o);
}

/// La orden debe ser del socio y estar en el estado indicado.
fn del_socio(o: &Orden, socio: &Address, estado: u32) -> Result<(), Error> {
    if o.socio != *socio {
        return Err(Error::NoEsDelSocio);
    }
    if o.estado != estado {
        return Err(Error::EstadoInvalido);
    }
    Ok(())
}

/// La orden debe ser del taller y estar en el estado indicado.
fn del_taller(o: &Orden, taller: &Address, estado: u32) -> Result<(), Error> {
    if o.taller != *taller {
        return Err(Error::NoEsDelTaller);
    }
    if o.estado != estado {
        return Err(Error::EstadoInvalido);
    }
    Ok(())
}

fn ganancias(env: &Env, taller: &Address) -> i128 {
    leer(env, &Clave::Ganancias(taller.clone())).unwrap_or(0)
}

fn sumar_ganancias(env: &Env, taller: &Address, monto: i128) {
    if monto > 0 {
        guardar(env, &Clave::Ganancias(taller.clone()), &(ganancias(env, taller) + monto));
    }
}

fn devolver(env: &Env, socio: &Address, monto: i128) {
    if monto > 0 {
        xlm(env).transfer(&env.current_contract_address(), socio, &monto);
    }
}

fn exigir_aprobado(env: &Env, taller: &Address) -> Result<(), Error> {
    if registro(env).es_aprobado(taller) {
        Ok(())
    } else {
        Err(Error::TallerNoAprobado)
    }
}

fn ceros(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0; 32])
}

#[contractimpl]
impl QrutaTaller {
    pub fn __constructor(env: Env, admin: Address, registro: Address, flota: Address, token: Address) {
        let i = env.storage().instance();
        i.set(&Clave::Admin, &admin);
        i.set(&Clave::Registro, &registro);
        i.set(&Clave::Flota, &flota);
        i.set(&Clave::Token, &token);
        i.extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
    }

    // ── Órdenes de trabajo ──

    /// El dueño de la unidad (según qruta-flota) pide una cotización a un taller aprobado. Devuelve el número de orden.
    pub fn solicitar_cotizacion(
        env: Env,
        socio: Address,
        placa: String,
        taller: Address,
        descripcion: BytesN<32>,
    ) -> Result<u32, Error> {
        socio.require_auth();
        if flota(&env).dueno(&placa) != Some(socio.clone()) {
            return Err(Error::NoEsDueno);
        }
        if socio == taller {
            return Err(Error::MismaCuenta);
        }
        exigir_aprobado(&env, &taller)?;
        let id: u32 = env.storage().instance().get(&Clave::SiguienteOrden).unwrap_or(0);
        env.storage().instance().set(&Clave::SiguienteOrden, &(id + 1));
        let o = Orden {
            socio: socio.clone(),
            taller,
            placa,
            descripcion,
            monto: 0,
            plazo_min: 0,
            compromiso: 0,
            estado: ORDEN_SOLICITADA,
            aceptada_ledger: 0,
            huella: ceros(&env),
        };
        guardar_orden(&env, id, &o);
        evento(&env, "cotizacion_solicitada", &socio, id, 0);
        Ok(id)
    }

    /// El taller cotiza la orden: monto en stroops y plazo de entrega en minutos (1 minuto a 30 días).
    pub fn cotizar(env: Env, taller: Address, id: u32, monto: i128, plazo_min: u32) -> Result<(), Error> {
        taller.require_auth();
        let mut o = orden(&env, id)?;
        del_taller(&o, &taller, ORDEN_SOLICITADA)?;
        exigir_aprobado(&env, &taller)?;
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        if plazo_min == 0 || plazo_min > PLAZO_MAXIMO_MIN {
            return Err(Error::PlazoInvalido);
        }
        o.monto = monto;
        o.plazo_min = plazo_min;
        o.estado = ORDEN_COTIZADA;
        guardar_orden(&env, id, &o);
        evento(&env, "orden_cotizada", &taller, id, monto);
        Ok(())
    }

    /// El socio rechaza la cotización.
    pub fn rechazar_cotizacion(env: Env, socio: Address, id: u32) -> Result<(), Error> {
        socio.require_auth();
        let mut o = orden(&env, id)?;
        del_socio(&o, &socio, ORDEN_COTIZADA)?;
        o.estado = ORDEN_RECHAZADA;
        guardar_orden(&env, id, &o);
        evento(&env, "cotizacion_rechazada", &socio, id, 0);
        Ok(())
    }

    /// El socio acepta la cotización: el monto pasa de su cuenta a este contrato hasta la entrega.
    /// Sigue debiendo ser el dueño de la unidad.
    pub fn aceptar_cotizacion(env: Env, socio: Address, id: u32) -> Result<(), Error> {
        socio.require_auth();
        let mut o = orden(&env, id)?;
        del_socio(&o, &socio, ORDEN_COTIZADA)?;
        if flota(&env).dueno(&o.placa) != Some(socio.clone()) {
            return Err(Error::NoEsDueno);
        }
        xlm(&env).transfer(&socio, env.current_contract_address(), &o.monto);
        o.estado = ORDEN_ACEPTADA;
        o.aceptada_ledger = env.ledger().sequence();
        guardar_orden(&env, id, &o);
        evento(&env, "cotizacion_aceptada", &socio, id, o.monto);
        Ok(())
    }

    /// El taller empieza el trabajo; corre el plazo de entrega. Devuelve la fecha límite.
    pub fn iniciar_trabajo(env: Env, taller: Address, id: u32) -> Result<u64, Error> {
        taller.require_auth();
        let mut o = orden(&env, id)?;
        del_taller(&o, &taller, ORDEN_ACEPTADA)?;
        o.compromiso = env.ledger().timestamp() + o.plazo_min as u64 * 60;
        o.estado = ORDEN_EN_PROCESO;
        guardar_orden(&env, id, &o);
        evento(&env, "trabajo_iniciado", &taller, id, 0);
        Ok(o.compromiso)
    }

    /// El taller entrega con el expediente que registró: debe existir en el registro, ser de esa placa,
    /// estar firmado por este taller y ser posterior a la aceptación.
    pub fn entregar_trabajo(env: Env, taller: Address, id: u32, expediente: BytesN<32>) -> Result<(), Error> {
        taller.require_auth();
        let mut o = orden(&env, id)?;
        del_taller(&o, &taller, ORDEN_EN_PROCESO)?;
        let reg = registro(&env).expediente(&expediente).ok_or(Error::ExpedienteNoExiste)?;
        if reg.placa != o.placa {
            return Err(Error::ExpedienteDeOtraPlaca);
        }
        if reg.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if reg.ledger < o.aceptada_ledger {
            return Err(Error::ServicioAnterior);
        }
        o.huella = expediente;
        o.estado = ORDEN_ENTREGADA;
        guardar_orden(&env, id, &o);
        evento(&env, "trabajo_entregado", &taller, id, 0);
        Ok(())
    }

    /// El socio acepta la entrega: el monto pasa a las ganancias del taller.
    pub fn confirmar_entrega(env: Env, socio: Address, id: u32) -> Result<(), Error> {
        socio.require_auth();
        let mut o = orden(&env, id)?;
        del_socio(&o, &socio, ORDEN_ENTREGADA)?;
        sumar_ganancias(&env, &o.taller, o.monto);
        o.estado = ORDEN_CONFIRMADA;
        guardar_orden(&env, id, &o);
        evento(&env, "entrega_confirmada", &socio, id, o.monto);
        Ok(())
    }

    /// El socio disputa la entrega con la huella de su evidencia; el dinero queda retenido.
    pub fn disputar_orden(env: Env, socio: Address, id: u32, evidencia: BytesN<32>) -> Result<(), Error> {
        socio.require_auth();
        let mut o = orden(&env, id)?;
        del_socio(&o, &socio, ORDEN_ENTREGADA)?;
        o.huella = evidencia;
        o.estado = ORDEN_DISPUTADA;
        guardar_orden(&env, id, &o);
        evento(&env, "orden_disputada", &socio, id, o.monto);
        Ok(())
    }

    /// El admin resuelve la disputa: `porcentaje_taller` (0 a 100) va a las ganancias del taller
    /// y el resto se devuelve al socio. Devuelve lo que recibe el taller.
    pub fn resolver_disputa(env: Env, id: u32, porcentaje_taller: u32) -> Result<i128, Error> {
        let admin = admin(&env);
        admin.require_auth();
        let mut o = orden(&env, id)?;
        if o.estado != ORDEN_DISPUTADA {
            return Err(Error::EstadoInvalido);
        }
        if porcentaje_taller > 100 {
            return Err(Error::PorcentajeInvalido);
        }
        let al_taller = o.monto * porcentaje_taller as i128 / 100;
        sumar_ganancias(&env, &o.taller, al_taller);
        devolver(&env, &o.socio, o.monto - al_taller);
        o.estado = ORDEN_RESUELTA;
        guardar_orden(&env, id, &o);
        evento(&env, "disputa_resuelta", &admin, id, al_taller);
        Ok(al_taller)
    }

    /// El socio cancela antes de que empiece el trabajo. Si ya había pagado, se le devuelve todo.
    pub fn cancelar_orden(env: Env, socio: Address, id: u32) -> Result<(), Error> {
        socio.require_auth();
        let mut o = orden(&env, id)?;
        if o.socio != socio {
            return Err(Error::NoEsDelSocio);
        }
        match o.estado {
            ORDEN_SOLICITADA | ORDEN_COTIZADA => {}
            ORDEN_ACEPTADA => devolver(&env, &socio, o.monto),
            _ => return Err(Error::EstadoInvalido),
        }
        o.estado = ORDEN_CANCELADA;
        guardar_orden(&env, id, &o);
        evento(&env, "orden_cancelada", &socio, id, 0);
        Ok(())
    }

    /// Si el taller no entregó a tiempo, el socio recupera todo su dinero y al taller se le cuenta un retraso.
    pub fn reclamar_por_retraso(env: Env, socio: Address, id: u32) -> Result<(), Error> {
        socio.require_auth();
        let mut o = orden(&env, id)?;
        del_socio(&o, &socio, ORDEN_EN_PROCESO)?;
        if env.ledger().timestamp() <= o.compromiso {
            return Err(Error::SinRetraso);
        }
        devolver(&env, &socio, o.monto);
        let clave = Clave::Retrasos(o.taller.clone());
        let retrasos: u32 = leer(&env, &clave).unwrap_or(0);
        guardar(&env, &clave, &(retrasos + 1));
        o.estado = ORDEN_REEMBOLSADA;
        guardar_orden(&env, id, &o);
        evento(&env, "retraso_reembolsado", &socio, id, o.monto);
        Ok(())
    }

    /// El taller cobra sus ganancias. Devuelve lo que le queda.
    pub fn retirar_ganancias(env: Env, taller: Address, monto: i128) -> Result<i128, Error> {
        taller.require_auth();
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        let saldo = ganancias(&env, &taller);
        if saldo < monto {
            return Err(Error::SaldoInsuficiente);
        }
        xlm(&env).transfer(&env.current_contract_address(), &taller, &monto);
        guardar(&env, &Clave::Ganancias(taller.clone()), &(saldo - monto));
        evento(&env, "ganancias_retiradas", &taller, 0, monto);
        Ok(saldo - monto)
    }

    /// El socio califica una orden terminada (confirmada o con disputa resuelta), de 1 a 5 y una sola vez.
    /// Devuelve el promedio del taller por 100.
    pub fn calificar_orden(env: Env, socio: Address, id: u32, estrellas: u32) -> Result<u32, Error> {
        socio.require_auth();
        let o = orden(&env, id)?;
        if o.socio != socio {
            return Err(Error::NoEsDelSocio);
        }
        if o.estado != ORDEN_CONFIRMADA && o.estado != ORDEN_RESUELTA {
            return Err(Error::EstadoInvalido);
        }
        if !(1..=5).contains(&estrellas) {
            return Err(Error::DatoInvalido);
        }
        let clave = Clave::Calificada(id);
        if env.storage().persistent().has(&clave) {
            return Err(Error::YaCalificada);
        }
        guardar(&env, &clave, &estrellas);
        let clave_rep = Clave::Reputacion(o.taller.clone());
        let mut rep = leer::<Reputacion>(&env, &clave_rep).unwrap_or(Reputacion { suma: 0, calificaciones: 0 });
        rep.suma += estrellas;
        rep.calificaciones += 1;
        guardar(&env, &clave_rep, &rep);
        evento(&env, "orden_calificada", &socio, id, estrellas as i128);
        Ok(rep.suma * 100 / rep.calificaciones)
    }

    // ── Refacciones ──

    /// El taller da de alta una refacción por la huella de su número de serie (única) y su tipo.
    pub fn registrar_pieza(env: Env, taller: Address, serie: BytesN<32>, tipo: Symbol) -> Result<(), Error> {
        taller.require_auth();
        exigir_aprobado(&env, &taller)?;
        let clave = Clave::Pieza(serie);
        if env.storage().persistent().has(&clave) {
            return Err(Error::PiezaExiste);
        }
        let pieza = Pieza { taller: taller.clone(), tipo, estado: PIEZA_EN_INVENTARIO, placa: String::from_str(&env, ""), expediente: ceros(&env) };
        guardar(&env, &clave, &pieza);
        evento(&env, "pieza_registrada", &taller, 0, 0);
        Ok(())
    }

    /// Un mecánico del taller, certificado vigente en el tipo de pieza, la instala en el servicio de un
    /// expediente que firmó su taller. La pieza queda ligada a esa placa y a ese expediente.
    pub fn instalar_pieza(env: Env, mecanico: Address, serie: BytesN<32>, expediente: BytesN<32>) -> Result<(), Error> {
        mecanico.require_auth();
        let taller: Address = leer(&env, &Clave::MecanicoDe(mecanico.clone())).ok_or(Error::NoEsMecanico)?;
        let clave = Clave::Pieza(serie);
        let mut pieza: Pieza = leer(&env, &clave).ok_or(Error::PiezaNoExiste)?;
        if pieza.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if pieza.estado != PIEZA_EN_INVENTARIO {
            return Err(Error::EstadoInvalido);
        }
        let vence: u64 = leer(&env, &Clave::Certificacion(mecanico.clone(), pieza.tipo.clone())).unwrap_or(0);
        if vence < env.ledger().timestamp() {
            return Err(Error::NoCertificado);
        }
        let reg = registro(&env).expediente(&expediente).ok_or(Error::ExpedienteNoExiste)?;
        if reg.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        pieza.estado = PIEZA_INSTALADA;
        pieza.placa = reg.placa;
        pieza.expediente = expediente;
        guardar(&env, &clave, &pieza);
        evento(&env, "pieza_instalada", &mecanico, 0, 0);
        Ok(())
    }

    /// El taller retira una pieza instalada (falla o reemplazo), con motivo. Una pieza retirada no se reinstala.
    pub fn retirar_pieza(env: Env, taller: Address, serie: BytesN<32>, motivo: String) -> Result<(), Error> {
        taller.require_auth();
        if motivo.len() < 3 || motivo.len() > 200 {
            return Err(Error::MotivoInvalido);
        }
        let clave = Clave::Pieza(serie);
        let mut pieza: Pieza = leer(&env, &clave).ok_or(Error::PiezaNoExiste)?;
        if pieza.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if pieza.estado != PIEZA_INSTALADA {
            return Err(Error::EstadoInvalido);
        }
        pieza.estado = PIEZA_RETIRADA;
        guardar(&env, &clave, &pieza);
        evento(&env, "pieza_retirada", &taller, 0, 0);
        Ok(())
    }

    /// El taller pasa una pieza de su inventario a otro taller aprobado.
    pub fn transferir_pieza(env: Env, taller: Address, serie: BytesN<32>, nuevo: Address) -> Result<(), Error> {
        taller.require_auth();
        let clave = Clave::Pieza(serie);
        let mut pieza: Pieza = leer(&env, &clave).ok_or(Error::PiezaNoExiste)?;
        if pieza.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if pieza.estado != PIEZA_EN_INVENTARIO {
            return Err(Error::EstadoInvalido);
        }
        if nuevo == taller {
            return Err(Error::MismaCuenta);
        }
        exigir_aprobado(&env, &nuevo)?;
        pieza.taller = nuevo;
        guardar(&env, &clave, &pieza);
        evento(&env, "pieza_transferida", &taller, 0, 0);
        Ok(())
    }

    // ── Mecánicos ──

    /// El taller aprobado da de alta a un mecánico. Un mecánico trabaja en un solo taller.
    pub fn alta_mecanico(env: Env, taller: Address, mecanico: Address) -> Result<(), Error> {
        taller.require_auth();
        exigir_aprobado(&env, &taller)?;
        if mecanico == taller {
            return Err(Error::MismaCuenta);
        }
        let clave = Clave::MecanicoDe(mecanico.clone());
        if env.storage().persistent().has(&clave) {
            return Err(Error::MecanicoOcupado);
        }
        guardar(&env, &clave, &taller);
        evento(&env, "mecanico_alta", &mecanico, 0, 0);
        Ok(())
    }

    /// El admin certifica a un mecánico dado de alta en un tipo de pieza (1 a 365 días). Devuelve la fecha de vencimiento.
    pub fn certificar_mecanico(env: Env, mecanico: Address, especialidad: Symbol, dias: u32) -> Result<u64, Error> {
        let admin = admin(&env);
        admin.require_auth();
        if !env.storage().persistent().has(&Clave::MecanicoDe(mecanico.clone())) {
            return Err(Error::NoEsMecanico);
        }
        if dias == 0 || dias > CERTIFICACION_MAXIMA_DIAS {
            return Err(Error::DatoInvalido);
        }
        let vence = env.ledger().timestamp() + dias as u64 * DIA;
        guardar(&env, &Clave::Certificacion(mecanico.clone(), especialidad), &vence);
        evento(&env, "mecanico_certificado", &mecanico, 0, dias as i128);
        Ok(vence)
    }

    /// El taller da de baja a su mecánico: ya no puede instalar piezas a su nombre.
    pub fn baja_mecanico(env: Env, taller: Address, mecanico: Address) -> Result<(), Error> {
        taller.require_auth();
        let clave = Clave::MecanicoDe(mecanico.clone());
        let suyo: Address = leer(&env, &clave).ok_or(Error::NoEsMecanico)?;
        if suyo != taller {
            return Err(Error::NoEsDelTaller);
        }
        env.storage().persistent().remove(&clave);
        evento(&env, "mecanico_baja", &mecanico, 0, 0);
        Ok(())
    }

    // ── Lecturas ──

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }

    pub fn orden(env: Env, id: u32) -> Option<Orden> {
        leer(&env, &Clave::Orden(id))
    }

    pub fn ganancias(env: Env, taller: Address) -> i128 {
        ganancias(&env, &taller)
    }

    pub fn retrasos(env: Env, taller: Address) -> u32 {
        leer(&env, &Clave::Retrasos(taller)).unwrap_or(0)
    }

    pub fn reputacion(env: Env, taller: Address) -> Option<Reputacion> {
        leer(&env, &Clave::Reputacion(taller))
    }

    pub fn pieza(env: Env, serie: BytesN<32>) -> Option<Pieza> {
        leer(&env, &Clave::Pieza(serie))
    }

    pub fn mecanico_de(env: Env, mecanico: Address) -> Option<Address> {
        leer(&env, &Clave::MecanicoDe(mecanico))
    }

    pub fn certificacion(env: Env, mecanico: Address, especialidad: Symbol) -> Option<u64> {
        leer(&env, &Clave::Certificacion(mecanico, especialidad))
    }
}

#[cfg(test)]
mod test;
