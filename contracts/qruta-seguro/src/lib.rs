//! Seguro de QRuta: pólizas para las unidades, ligadas a qruta-registry (vigencia) y qruta-flota (dueño).
//!
//! - Solo el dueño de una unidad vigente contrata o renueva su póliza; la prima va a la reserva del contrato.
//! - La cobertura es 10 veces la prima; un siniestro se reporta mientras la póliza está vigente.
//! - El admin evalúa y paga desde la reserva, que nunca puede quedar por debajo de lo ya aprobado.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN, Env,
    String, Symbol,
};

const DIA: u64 = 86_400;
const TTL_UMBRAL: u32 = 30 * 17_280;
const TTL_EXTENDER: u32 = 120 * 17_280;
const COBERTURA_POR_PRIMA: i128 = 10;

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

#[allow(dead_code)]
#[contractclient(name = "RegistroClient")]
pub trait Registry {
    fn estado(env: Env, placa: String) -> Option<EstadoUnidad>;
}

#[allow(dead_code)]
#[contractclient(name = "FlotaClient")]
pub trait Flota {
    fn dueno(env: Env, placa: String) -> Option<Address>;
}

#[contracttype]
#[derive(Clone)]
enum Clave {
    Admin,
    Registro,
    Flota,
    Token,
    Reserva,
    Comprometido,
    SiguienteSiniestro,
    Poliza(String),
    Siniestro(u32),
    Vetado(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Poliza {
    pub socio: Address,
    pub prima: i128,
    pub desde: u64,
    pub hasta: u64,
    pub siniestro_abierto: bool,
    pub siniestros_pagados: u32,
    pub bonificada: bool,
    pub suspendida: bool,
    /// Lo que paga el dueño de cada siniestro aprobado (se descuenta del pago).
    pub deducible: i128,
}

pub const SINIESTRO_REPORTADO: u32 = 0;
pub const SINIESTRO_APROBADO: u32 = 1;
pub const SINIESTRO_RECHAZADO: u32 = 2;
pub const SINIESTRO_APELADO: u32 = 3;
pub const SINIESTRO_PAGADO: u32 = 4;
pub const SINIESTRO_DESISTIDO: u32 = 5;
pub const SINIESTRO_FRAUDE: u32 = 6;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Siniestro {
    pub placa: String,
    pub socio: Address,
    pub reclamado: i128,
    pub aprobado: i128,
    pub evidencia: BytesN<32>,
    pub estado: u32,
    /// Lo ya pagado (anticipos y pago final) y lo que el dueño devolvió.
    pub pagado: i128,
    pub devuelto: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoEsDueno = 1,
    UnidadNoVigente = 2,
    DatoInvalido = 3,
    MontoInvalido = 4,
    PolizaActiva = 5,
    SinPoliza = 6,
    PolizaVencida = 7,
    SiniestroAbierto = 8,
    ExcedeCobertura = 9,
    SiniestroNoExiste = 10,
    EstadoInvalido = 11,
    ReservaInsuficiente = 12,
    YaBonificada = 13,
    ConSiniestros = 14,
    Vetado = 15,
    PolizaSuspendida = 16,
    NoSuspendida = 17,
    MotivoInvalido = 18,
    MismoDueno = 19,
    PolizaVigente = 20,
    NoVetado = 21,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Seguro {
    #[topic]
    pub accion: Symbol,
    pub cuenta: Address,
    pub placa: String,
    pub monto: i128,
}

#[contract]
pub struct QrutaSeguro;

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&Clave::Admin).unwrap()
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

fn numero(env: &Env, clave: &Clave) -> i128 {
    env.storage().instance().get(clave).unwrap_or(0)
}

fn poner_numero(env: &Env, clave: &Clave, v: i128) {
    env.storage().instance().set(clave, &v);
    env.storage().instance().extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
}

fn evento(env: &Env, accion: &str, cuenta: &Address, placa: &String, monto: i128) {
    env.storage().instance().extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
    Seguro { accion: Symbol::new(env, accion), cuenta: cuenta.clone(), placa: placa.clone(), monto }.publish(env);
}

/// Exige que el socio sea el dueño en la flota y que la unidad esté vigente en el registro.
fn dueno_de_unidad_vigente(env: &Env, socio: &Address, placa: &String) -> Result<(), Error> {
    let fl: Address = env.storage().instance().get(&Clave::Flota).unwrap();
    if FlotaClient::new(env, &fl).dueno(placa) != Some(socio.clone()) {
        return Err(Error::NoEsDueno);
    }
    let reg: Address = env.storage().instance().get(&Clave::Registro).unwrap();
    if !RegistroClient::new(env, &reg).estado(placa).is_some_and(|e| e.vigente) {
        return Err(Error::UnidadNoVigente);
    }
    Ok(())
}

fn siniestro(env: &Env, id: u32) -> Result<Siniestro, Error> {
    leer(env, &Clave::Siniestro(id)).ok_or(Error::SiniestroNoExiste)
}

fn validar_poliza(dias: u32, prima: i128) -> Result<(), Error> {
    if !(30..=365).contains(&dias) {
        return Err(Error::DatoInvalido);
    }
    if prima <= 0 {
        return Err(Error::MontoInvalido);
    }
    Ok(())
}

#[contractimpl]
impl QrutaSeguro {
    pub fn __constructor(env: Env, admin: Address, registro: Address, flota: Address, token: Address) {
        let i = env.storage().instance();
        i.set(&Clave::Admin, &admin);
        i.set(&Clave::Registro, &registro);
        i.set(&Clave::Flota, &flota);
        i.set(&Clave::Token, &token);
        i.extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
    }

    /// El dueño de una unidad vigente contrata una póliza de 30 a 365 días; la prima pasa a la reserva.
    /// Una póliza activa por placa. Devuelve la fecha de vencimiento.
    pub fn contratar_poliza(env: Env, socio: Address, placa: String, dias: u32, prima: i128) -> Result<u64, Error> {
        socio.require_auth();
        validar_poliza(dias, prima)?;
        if env.storage().persistent().has(&Clave::Vetado(socio.clone())) {
            return Err(Error::Vetado);
        }
        dueno_de_unidad_vigente(&env, &socio, &placa)?;
        let ahora = env.ledger().timestamp();
        if leer::<Poliza>(&env, &Clave::Poliza(placa.clone())).is_some_and(|p| p.hasta >= ahora) {
            return Err(Error::PolizaActiva);
        }
        xlm(&env).transfer(&socio, env.current_contract_address(), &prima);
        poner_numero(&env, &Clave::Reserva, numero(&env, &Clave::Reserva) + prima);
        let hasta = ahora + dias as u64 * DIA;
        let p = Poliza {
            socio: socio.clone(),
            prima,
            desde: ahora,
            hasta,
            siniestro_abierto: false,
            siniestros_pagados: 0,
            bonificada: false,
            suspendida: false,
            deducible: 0,
        };
        guardar(&env, &Clave::Poliza(placa.clone()), &p);
        evento(&env, "poliza_contratada", &socio, &placa, prima);
        Ok(hasta)
    }

    /// El dueño renueva su póliza activa: paga otra prima y la vigencia se extiende. La unidad debe seguir vigente.
    pub fn renovar_poliza(env: Env, socio: Address, placa: String, dias: u32, prima: i128) -> Result<u64, Error> {
        socio.require_auth();
        validar_poliza(dias, prima)?;
        dueno_de_unidad_vigente(&env, &socio, &placa)?;
        let clave = Clave::Poliza(placa.clone());
        let mut p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if p.hasta < env.ledger().timestamp() {
            return Err(Error::PolizaVencida);
        }
        xlm(&env).transfer(&socio, env.current_contract_address(), &prima);
        poner_numero(&env, &Clave::Reserva, numero(&env, &Clave::Reserva) + prima);
        p.socio = socio.clone();
        p.prima += prima;
        p.hasta += dias as u64 * DIA;
        guardar(&env, &clave, &p);
        evento(&env, "poliza_renovada", &socio, &placa, prima);
        Ok(p.hasta)
    }

    /// El dueño cancela su póliza activa sin siniestro abierto y recupera la parte proporcional de la prima.
    /// Devuelve lo reembolsado.
    pub fn cancelar_poliza(env: Env, socio: Address, placa: String) -> Result<i128, Error> {
        socio.require_auth();
        let clave = Clave::Poliza(placa.clone());
        let p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if p.socio != socio {
            return Err(Error::NoEsDueno);
        }
        let ahora = env.ledger().timestamp();
        if p.hasta < ahora {
            return Err(Error::PolizaVencida);
        }
        if p.siniestro_abierto {
            return Err(Error::SiniestroAbierto);
        }
        let total = (p.hasta - p.desde) as i128;
        let reembolso = if total == 0 { 0 } else { p.prima * (p.hasta - ahora) as i128 / total };
        let libre = numero(&env, &Clave::Reserva) - numero(&env, &Clave::Comprometido);
        let reembolso = reembolso.min(libre.max(0));
        if reembolso > 0 {
            xlm(&env).transfer(&env.current_contract_address(), &socio, &reembolso);
            poner_numero(&env, &Clave::Reserva, numero(&env, &Clave::Reserva) - reembolso);
        }
        env.storage().persistent().remove(&clave);
        evento(&env, "poliza_cancelada", &socio, &placa, reembolso);
        Ok(reembolso)
    }

    /// El admin aporta XLM a la reserva para pagar siniestros. Devuelve la reserva.
    pub fn fondear_reserva(env: Env, monto: i128) -> Result<i128, Error> {
        let admin = admin(&env);
        admin.require_auth();
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        xlm(&env).transfer(&admin, env.current_contract_address(), &monto);
        let reserva = numero(&env, &Clave::Reserva) + monto;
        poner_numero(&env, &Clave::Reserva, reserva);
        evento(&env, "reserva_fondeada", &admin, &String::from_str(&env, ""), monto);
        Ok(reserva)
    }

    /// El dueño reporta un siniestro con póliza vigente, hasta la cobertura (10 veces la prima) y uno a la vez.
    /// Devuelve el número de siniestro.
    pub fn reportar_siniestro(env: Env, socio: Address, placa: String, monto: i128, evidencia: BytesN<32>) -> Result<u32, Error> {
        socio.require_auth();
        let clave = Clave::Poliza(placa.clone());
        let mut p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if p.socio != socio {
            return Err(Error::NoEsDueno);
        }
        if p.hasta < env.ledger().timestamp() {
            return Err(Error::PolizaVencida);
        }
        if p.suspendida {
            return Err(Error::PolizaSuspendida);
        }
        if p.siniestro_abierto {
            return Err(Error::SiniestroAbierto);
        }
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        if monto > p.prima * COBERTURA_POR_PRIMA {
            return Err(Error::ExcedeCobertura);
        }
        let id: u32 = env.storage().instance().get(&Clave::SiguienteSiniestro).unwrap_or(0);
        env.storage().instance().set(&Clave::SiguienteSiniestro, &(id + 1));
        let s = Siniestro {
            placa: placa.clone(),
            socio: socio.clone(),
            reclamado: monto,
            aprobado: 0,
            evidencia,
            estado: SINIESTRO_REPORTADO,
            pagado: 0,
            devuelto: 0,
        };
        guardar(&env, &Clave::Siniestro(id), &s);
        p.siniestro_abierto = true;
        guardar(&env, &clave, &p);
        evento(&env, "siniestro_reportado", &socio, &placa, monto);
        Ok(id)
    }

    /// El admin evalúa un siniestro reportado o apelado. Si lo aprueba (hasta lo reclamado), el monto queda
    /// comprometido en la reserva; si lo rechaza, la póliza queda libre para otro reporte.
    pub fn evaluar_siniestro(env: Env, id: u32, aprobar: bool, monto: i128) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        let mut s = siniestro(&env, id)?;
        if s.estado != SINIESTRO_REPORTADO && s.estado != SINIESTRO_APELADO {
            return Err(Error::EstadoInvalido);
        }
        if aprobar {
            if monto <= 0 || monto > s.reclamado {
                return Err(Error::MontoInvalido);
            }
            let comprometido = numero(&env, &Clave::Comprometido) + monto;
            if comprometido > numero(&env, &Clave::Reserva) {
                return Err(Error::ReservaInsuficiente);
            }
            poner_numero(&env, &Clave::Comprometido, comprometido);
            s.aprobado = monto;
            s.estado = SINIESTRO_APROBADO;
        } else {
            s.estado = SINIESTRO_RECHAZADO;
            let clave = Clave::Poliza(s.placa.clone());
            if let Some(mut p) = leer::<Poliza>(&env, &clave) {
                p.siniestro_abierto = false;
                guardar(&env, &clave, &p);
            }
        }
        guardar(&env, &Clave::Siniestro(id), &s);
        evento(&env, if aprobar { "siniestro_aprobado" } else { "siniestro_rechazado" }, &admin, &s.placa, s.aprobado);
        Ok(())
    }

    /// El admin paga un siniestro aprobado al dueño que lo reportó, desde la reserva: lo aprobado menos el
    /// deducible de la póliza y menos los anticipos. Libera lo comprometido. Devuelve lo pagado ahora.
    pub fn pagar_siniestro(env: Env, id: u32) -> Result<i128, Error> {
        let admin = admin(&env);
        admin.require_auth();
        let mut s = siniestro(&env, id)?;
        if s.estado != SINIESTRO_APROBADO {
            return Err(Error::EstadoInvalido);
        }
        let clave = Clave::Poliza(s.placa.clone());
        let mut p: Option<Poliza> = leer(&env, &clave);
        let deducible = p.as_ref().map(|p| p.deducible).unwrap_or(0);
        let neto = (s.aprobado - deducible).max(0);
        let restante = (neto - s.pagado).max(0);
        if restante > 0 {
            xlm(&env).transfer(&env.current_contract_address(), &s.socio, &restante);
            poner_numero(&env, &Clave::Reserva, numero(&env, &Clave::Reserva) - restante);
        }
        poner_numero(&env, &Clave::Comprometido, numero(&env, &Clave::Comprometido) - (s.aprobado - s.pagado));
        s.pagado += restante;
        s.estado = SINIESTRO_PAGADO;
        guardar(&env, &Clave::Siniestro(id), &s);
        if let Some(p) = p.as_mut() {
            p.siniestro_abierto = false;
            p.siniestros_pagados += 1;
            guardar(&env, &clave, p);
        }
        evento(&env, "siniestro_pagado", &s.socio, &s.placa, restante);
        Ok(restante)
    }

    /// El dueño apela un siniestro rechazado con nueva evidencia, una sola vez y con la póliza vigente.
    pub fn apelar_siniestro(env: Env, socio: Address, id: u32, evidencia: BytesN<32>) -> Result<(), Error> {
        socio.require_auth();
        let mut s = siniestro(&env, id)?;
        if s.socio != socio {
            return Err(Error::NoEsDueno);
        }
        if s.estado != SINIESTRO_RECHAZADO {
            return Err(Error::EstadoInvalido);
        }
        let clave = Clave::Poliza(s.placa.clone());
        let mut p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if p.hasta < env.ledger().timestamp() {
            return Err(Error::PolizaVencida);
        }
        if p.siniestro_abierto {
            return Err(Error::SiniestroAbierto);
        }
        p.siniestro_abierto = true;
        guardar(&env, &clave, &p);
        s.evidencia = evidencia;
        s.estado = SINIESTRO_APELADO;
        guardar(&env, &Clave::Siniestro(id), &s);
        evento(&env, "siniestro_apelado", &socio, &s.placa, s.reclamado);
        Ok(())
    }

    /// El admin devuelve el 10% de la prima a una póliza activa sin siniestros pagados ni abiertos,
    /// cuya unidad sigue vigente. Una vez por póliza. Devuelve el bono.
    pub fn bonificar_buen_historial(env: Env, placa: String) -> Result<i128, Error> {
        let admin = admin(&env);
        admin.require_auth();
        let clave = Clave::Poliza(placa.clone());
        let mut p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if p.hasta < env.ledger().timestamp() {
            return Err(Error::PolizaVencida);
        }
        if p.bonificada {
            return Err(Error::YaBonificada);
        }
        if p.siniestros_pagados > 0 || p.siniestro_abierto {
            return Err(Error::ConSiniestros);
        }
        dueno_de_unidad_vigente(&env, &p.socio, &placa)?;
        let bono = p.prima / 10;
        let libre = numero(&env, &Clave::Reserva) - numero(&env, &Clave::Comprometido);
        if bono > libre {
            return Err(Error::ReservaInsuficiente);
        }
        xlm(&env).transfer(&env.current_contract_address(), &p.socio, &bono);
        poner_numero(&env, &Clave::Reserva, numero(&env, &Clave::Reserva) - bono);
        p.bonificada = true;
        guardar(&env, &clave, &p);
        evento(&env, "buen_historial_bonificado", &p.socio, &placa, bono);
        Ok(bono)
    }

    /// El admin retira de la reserva solo lo que no está comprometido con siniestros aprobados.
    /// Devuelve la reserva que queda.
    pub fn retirar_reserva(env: Env, monto: i128) -> Result<i128, Error> {
        let admin = admin(&env);
        admin.require_auth();
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        let reserva = numero(&env, &Clave::Reserva);
        if monto > reserva - numero(&env, &Clave::Comprometido) {
            return Err(Error::ReservaInsuficiente);
        }
        xlm(&env).transfer(&env.current_contract_address(), &admin, &monto);
        poner_numero(&env, &Clave::Reserva, reserva - monto);
        evento(&env, "reserva_retirada", &admin, &String::from_str(&env, ""), monto);
        Ok(reserva - monto)
    }

    // ── Ajustes, controles y cierre ──

    /// El nuevo dueño de la unidad (según la flota) toma la póliza activa del anterior, sin siniestro abierto.
    pub fn transferir_poliza(env: Env, nuevo: Address, placa: String) -> Result<(), Error> {
        nuevo.require_auth();
        let fl: Address = env.storage().instance().get(&Clave::Flota).unwrap();
        if FlotaClient::new(&env, &fl).dueno(&placa) != Some(nuevo.clone()) {
            return Err(Error::NoEsDueno);
        }
        let clave = Clave::Poliza(placa.clone());
        let mut p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if p.socio == nuevo {
            return Err(Error::MismoDueno);
        }
        if p.hasta < env.ledger().timestamp() {
            return Err(Error::PolizaVencida);
        }
        if p.siniestro_abierto {
            return Err(Error::SiniestroAbierto);
        }
        p.socio = nuevo.clone();
        guardar(&env, &clave, &p);
        evento(&env, "poliza_transferida", &nuevo, &placa, 0);
        Ok(())
    }

    /// El admin suspende una póliza activa con motivo: mientras esté suspendida no admite siniestros.
    pub fn suspender_poliza(env: Env, placa: String, motivo: String) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        if motivo.len() < 3 || motivo.len() > 200 {
            return Err(Error::MotivoInvalido);
        }
        let clave = Clave::Poliza(placa.clone());
        let mut p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if p.suspendida {
            return Err(Error::PolizaSuspendida);
        }
        p.suspendida = true;
        guardar(&env, &clave, &p);
        evento(&env, "poliza_suspendida", &admin, &placa, 0);
        Ok(())
    }

    /// El admin reactiva una póliza suspendida, solo si la unidad sigue vigente en el registro.
    pub fn reactivar_poliza(env: Env, placa: String) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        let clave = Clave::Poliza(placa.clone());
        let mut p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if !p.suspendida {
            return Err(Error::NoSuspendida);
        }
        dueno_de_unidad_vigente(&env, &p.socio, &placa)?;
        p.suspendida = false;
        guardar(&env, &clave, &p);
        evento(&env, "poliza_reactivada", &admin, &placa, 0);
        Ok(())
    }

    /// El admin fija el deducible de una póliza (hasta el valor de la prima), sin siniestro abierto.
    pub fn fijar_deducible(env: Env, placa: String, monto: i128) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        let clave = Clave::Poliza(placa.clone());
        let mut p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        if monto < 0 || monto > p.prima {
            return Err(Error::MontoInvalido);
        }
        if p.siniestro_abierto {
            return Err(Error::SiniestroAbierto);
        }
        p.deducible = monto;
        guardar(&env, &clave, &p);
        evento(&env, "deducible_fijado", &admin, &placa, monto);
        Ok(())
    }

    /// El dueño retira su siniestro reportado o apelado; la póliza queda libre.
    pub fn desistir_siniestro(env: Env, socio: Address, id: u32) -> Result<(), Error> {
        socio.require_auth();
        let mut s = siniestro(&env, id)?;
        if s.socio != socio {
            return Err(Error::NoEsDueno);
        }
        if s.estado != SINIESTRO_REPORTADO && s.estado != SINIESTRO_APELADO {
            return Err(Error::EstadoInvalido);
        }
        s.estado = SINIESTRO_DESISTIDO;
        guardar(&env, &Clave::Siniestro(id), &s);
        let clave = Clave::Poliza(s.placa.clone());
        if let Some(mut p) = leer::<Poliza>(&env, &clave) {
            p.siniestro_abierto = false;
            guardar(&env, &clave, &p);
        }
        evento(&env, "siniestro_desistido", &socio, &s.placa, 0);
        Ok(())
    }

    /// El admin adelanta parte de un siniestro aprobado; el anticipo no puede alcanzar el neto
    /// (aprobado menos deducible). Devuelve lo pagado hasta ahora.
    pub fn anticipar_pago(env: Env, id: u32, monto: i128) -> Result<i128, Error> {
        let admin = admin(&env);
        admin.require_auth();
        let mut s = siniestro(&env, id)?;
        if s.estado != SINIESTRO_APROBADO {
            return Err(Error::EstadoInvalido);
        }
        let deducible = leer::<Poliza>(&env, &Clave::Poliza(s.placa.clone())).map(|p| p.deducible).unwrap_or(0);
        if monto <= 0 || s.pagado + monto >= s.aprobado - deducible {
            return Err(Error::MontoInvalido);
        }
        xlm(&env).transfer(&env.current_contract_address(), &s.socio, &monto);
        poner_numero(&env, &Clave::Reserva, numero(&env, &Clave::Reserva) - monto);
        poner_numero(&env, &Clave::Comprometido, numero(&env, &Clave::Comprometido) - monto);
        s.pagado += monto;
        guardar(&env, &Clave::Siniestro(id), &s);
        evento(&env, "pago_anticipado", &s.socio, &s.placa, monto);
        Ok(s.pagado)
    }

    /// El admin marca como fraude un siniestro reportado o apelado: se rechaza, la póliza se suspende
    /// y el dueño queda vetado para contratar pólizas nuevas.
    pub fn marcar_fraude(env: Env, id: u32, motivo: String) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        if motivo.len() < 3 || motivo.len() > 200 {
            return Err(Error::MotivoInvalido);
        }
        let mut s = siniestro(&env, id)?;
        if s.estado != SINIESTRO_REPORTADO && s.estado != SINIESTRO_APELADO {
            return Err(Error::EstadoInvalido);
        }
        s.estado = SINIESTRO_FRAUDE;
        guardar(&env, &Clave::Siniestro(id), &s);
        let clave = Clave::Poliza(s.placa.clone());
        if let Some(mut p) = leer::<Poliza>(&env, &clave) {
            p.siniestro_abierto = false;
            p.suspendida = true;
            guardar(&env, &clave, &p);
        }
        guardar(&env, &Clave::Vetado(s.socio.clone()), &motivo);
        evento(&env, "siniestro_fraude", &admin, &s.placa, s.reclamado);
        Ok(())
    }

    /// El admin levanta el veto de un dueño, con motivo.
    pub fn levantar_veto(env: Env, socio: Address, motivo: String) -> Result<(), Error> {
        let admin = admin(&env);
        admin.require_auth();
        if motivo.len() < 3 || motivo.len() > 200 {
            return Err(Error::MotivoInvalido);
        }
        let clave = Clave::Vetado(socio.clone());
        if !env.storage().persistent().has(&clave) {
            return Err(Error::NoVetado);
        }
        env.storage().persistent().remove(&clave);
        evento(&env, "veto_levantado", &admin, &String::from_str(&env, ""), 0);
        Ok(())
    }

    /// Cualquiera cierra, sin siniestro abierto, una póliza ya vencida o la de una unidad que perdió su
    /// vigencia en el registro (servicio vencido o anulado): sin mantenimiento no hay cobertura.
    pub fn vencer_poliza(env: Env, placa: String) -> Result<(), Error> {
        let clave = Clave::Poliza(placa.clone());
        let p: Poliza = leer(&env, &clave).ok_or(Error::SinPoliza)?;
        let reg: Address = env.storage().instance().get(&Clave::Registro).unwrap();
        let unidad_vigente = RegistroClient::new(&env, &reg).estado(&placa).is_some_and(|e| e.vigente);
        if p.hasta >= env.ledger().timestamp() && unidad_vigente {
            return Err(Error::PolizaVigente);
        }
        if p.siniestro_abierto {
            return Err(Error::SiniestroAbierto);
        }
        env.storage().persistent().remove(&clave);
        evento(&env, "poliza_vencida", &p.socio, &placa, 0);
        Ok(())
    }

    /// El dueño devuelve a la reserva parte de un siniestro pagado (por ejemplo, la reparación costó menos),
    /// hasta lo que recibió. Devuelve el total devuelto.
    pub fn devolver_excedente(env: Env, socio: Address, id: u32, monto: i128) -> Result<i128, Error> {
        socio.require_auth();
        let mut s = siniestro(&env, id)?;
        if s.socio != socio {
            return Err(Error::NoEsDueno);
        }
        if s.estado != SINIESTRO_PAGADO {
            return Err(Error::EstadoInvalido);
        }
        if monto <= 0 || s.devuelto + monto > s.pagado {
            return Err(Error::MontoInvalido);
        }
        xlm(&env).transfer(&socio, env.current_contract_address(), &monto);
        poner_numero(&env, &Clave::Reserva, numero(&env, &Clave::Reserva) + monto);
        s.devuelto += monto;
        guardar(&env, &Clave::Siniestro(id), &s);
        evento(&env, "excedente_devuelto", &socio, &s.placa, monto);
        Ok(s.devuelto)
    }

    pub fn vetado(env: Env, socio: Address) -> bool {
        env.storage().persistent().has(&Clave::Vetado(socio))
    }

    pub fn poliza(env: Env, placa: String) -> Option<Poliza> {
        leer(&env, &Clave::Poliza(placa))
    }

    pub fn siniestro(env: Env, id: u32) -> Option<Siniestro> {
        leer(&env, &Clave::Siniestro(id))
    }

    /// (reserva, comprometido) en stroops.
    pub fn reserva(env: Env) -> (i128, i128) {
        (numero(&env, &Clave::Reserva), numero(&env, &Clave::Comprometido))
    }
}

#[cfg(test)]
mod test;
