//! Registro on-chain de QRuta.
//!
//! - KYB on-chain: solo el admin (QRuta) aprueba o suspende talleres por su dirección de Stellar.
//! - Cada expediente lo firma el propio taller (`require_auth`) y queda guardado por su hash SHA-256.
//! - Cualquiera puede consultar gratis el estado de una placa o un expediente por su hash.
//!
//! Los datos del expediente (notas, kilometraje, checklist) NO se guardan aquí: solo su hash.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, ContractExecutable, Env, String,
    Symbol, Vec,
};

// Un ledger cada ~5 s.
const DIA_EN_LEDGERS: u32 = 17_280;
const TTL_UMBRAL: u32 = 30 * DIA_EN_LEDGERS;
const TTL_EXTENDER: u32 = 120 * DIA_EN_LEDGERS;

const DIA: u64 = 86_400;
// La fecha del servicio puede ir hasta 2 días adelante del ledger (husos horarios y margen de la app).
const TOLERANCIA_FECHA: u64 = 2 * DIA;
// Con 3 reportes de pasajeros distintos (o de días distintos) la unidad queda en revisión.
const REPORTES_PARA_REVISION: u32 = 3;
// Kilómetros desde el último servicio a partir de los cuales la unidad queda en revisión.
const KM_PARA_REVISION: u64 = 10_000;
// Una delegación de firma dura como máximo 90 días.
const DELEGACION_MAXIMA: u64 = 90 * DIA;
// Una cita puede caer hasta 30 días después de que vence el servicio vigente.
const CITA_MARGEN: u64 = 30 * DIA;
// Una prórroga de la autoridad es de 15 días como máximo.
const PRORROGA_MAXIMA: u32 = 15;
// Máximo de expedientes en un solo `registrar_lote` (límite de recursos por transacción).
const LOTE_MAXIMO: u32 = 10;

#[contracttype]
#[derive(Clone)]
enum Clave {
    Admin,
    Taller(Address),
    Expediente(BytesN<32>),
    Ultimo(String),
    // Claves nuevas en v2: los registros anteriores no cambian de formato.
    Anulado(BytesN<32>),
    CorregidoPor(BytesN<32>),
    // Claves nuevas en v3.
    Revision(String),
    ReporteDe(String, Address),
    Cofirma(BytesN<32>),
    Custodio(String),
    // Claves nuevas en v4.
    Baja(String),
    Apelacion(BytesN<32>),
    // Claves nuevas en v5.
    Solicitud(Address),
    Delegado(Address, Address),
    Operador(String),
    OperadorDe(Address),
    Kilometraje(String),
    Cita(String),
    Autoridad(Address),
    Inspeccion(String),
    Prorroga(BytesN<32>),
    AdminPropuesto,
    ReporteCiclo(String, Address),
    CausaExterna(String),
}

/// Lo que queda on-chain de cada expediente.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registro {
    pub placa: String,
    pub taller: Address,
    pub tipo: Symbol,
    /// Fecha del servicio (unix, segundos).
    pub fecha: u64,
    /// Fin de la vigencia (unix, segundos).
    pub vigente_hasta: u64,
    /// Ledger en que se registró.
    pub ledger: u32,
}

/// Por qué y cuándo se anuló un expediente.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Anulacion {
    pub motivo: String,
    pub ledger: u32,
}

/// Reportes de falla de una unidad desde la última vez que un taller los atendió.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Revision {
    pub reportes: u32,
    /// true cuando llegó a REPORTES_PARA_REVISION: la unidad necesita un servicio nuevo.
    pub en_revision: bool,
    /// Ledger del primer reporte de este ciclo: el servicio que lo atienda debe ser de un ledger posterior.
    pub desde_ledger: u32,
    /// Huella (SHA-256) de la evidencia del último reporte (foto o descripción, fuera de la cadena).
    pub ultima_evidencia: BytesN<32>,
}

/// Aval de un segundo taller sobre un expediente.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cofirma {
    pub inspector: Address,
    pub ledger: u32,
}

/// Unidad retirada de circulación.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Baja {
    pub motivo: String,
    pub por: Address,
    pub ledger: u32,
}

/// Apelación de un taller contra la anulación de su expediente.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Apelacion {
    pub motivo: String,
    pub ledger: u32,
    pub resuelta: bool,
    pub aceptada: bool,
}

/// Solicitud de alta de un taller (huella del RFC y documentos, fuera de la cadena).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Solicitud {
    pub huella: BytesN<32>,
    pub ledger: u32,
}

/// Lecturas de odómetro de una unidad.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Kilometraje {
    /// Última lectura.
    pub ultimo: u64,
    /// Lectura al empezar a contar desde el servicio `hash_base`.
    pub base: u64,
    pub hash_base: BytesN<32>,
}

/// Cita de servicio programada.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cita {
    pub taller: Address,
    pub fecha: u64,
}

/// Última inspección en la vía pública.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Inspeccion {
    pub autoridad: Address,
    pub aprobada: bool,
    pub evidencia: BytesN<32>,
    pub ledger: u32,
}

/// Un expediente dentro de `registrar_lote`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpedienteLote {
    pub placa: String,
    pub hash: BytesN<32>,
    pub tipo: Symbol,
    pub fecha: u64,
    pub vigente_hasta: u64,
}

/// Estado público de una unidad: su expediente más reciente por fecha de servicio.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EstadoUnidad {
    pub hash: BytesN<32>,
    pub registro: Registro,
    pub vigente: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    TallerNoAprobado = 1,
    PlacaInvalida = 2,
    TipoInvalido = 3,
    VigenciaInvalida = 4,
    ExpedienteDuplicado = 5,
    FechaFutura = 6,
    PlacaSinRegistro = 7,
    ExpedienteNoExiste = 8,
    ExpedienteAnulado = 9,
    MotivoInvalido = 10,
    NoEsDelTaller = 11,
    ExpedienteYaCorregido = 12,
    ReporteRepetido = 13,
    SinReportes = 14,
    ExpedienteDeOtraPlaca = 15,
    ExpedienteAnterior = 16,
    MismoTaller = 17,
    YaCofirmado = 18,
    NoEsCustodio = 19,
    LoteInvalido = 20,
    NoAutorizado = 21,
    UnidadDeBaja = 22,
    NoEstaDeBaja = 23,
    NoEstaAnulado = 24,
    YaApelado = 25,
    SinApelacion = 26,
    YaAprobado = 27,
    SolicitudAbierta = 28,
    SinSolicitud = 29,
    FechaInvalida = 30,
    SinDelegacion = 31,
    OperadorOcupado = 32,
    NoEsOperador = 33,
    KilometrajeInvalido = 34,
    CitaAbierta = 35,
    SinCita = 36,
    EsTaller = 37,
    YaEsAutoridad = 38,
    NoEsAutoridad = 39,
    ProrrogaInvalida = 40,
    YaProrrogado = 41,
    SinPropuesta = 42,
    MismoAdmin = 43,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TallerAprobado {
    #[topic]
    pub taller: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TallerSuspendido {
    #[topic]
    pub taller: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpedienteRegistrado {
    #[topic]
    pub placa: String,
    pub hash: BytesN<32>,
    pub taller: Address,
    pub vigente_hasta: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnidadRenovada {
    #[topic]
    pub placa: String,
    pub hash: BytesN<32>,
    pub ttl: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpedienteAnulado {
    #[topic]
    pub placa: String,
    pub hash: BytesN<32>,
    pub motivo: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpedienteCorregido {
    #[topic]
    pub placa: String,
    pub anterior: BytesN<32>,
    pub nuevo: BytesN<32>,
    pub motivo: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FallaReportada {
    #[topic]
    pub placa: String,
    pub reportante: Address,
    pub evidencia: BytesN<32>,
    pub reportes: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnidadEnRevision {
    #[topic]
    pub placa: String,
    pub reportes: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReporteAtendido {
    #[topic]
    pub placa: String,
    pub taller: Address,
    pub hash: BytesN<32>,
    pub reportes: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpedienteCofirmado {
    #[topic]
    pub placa: String,
    pub hash: BytesN<32>,
    pub inspector: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnidadTransferida {
    #[topic]
    pub placa: String,
    pub de: Address,
    pub a: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoteRegistrado {
    #[topic]
    pub taller: Address,
    pub expedientes: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnidadDadaDeBaja {
    #[topic]
    pub placa: String,
    pub por: Address,
    pub motivo: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnidadReactivada {
    #[topic]
    pub placa: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AnulacionApelada {
    #[topic]
    pub placa: String,
    pub hash: BytesN<32>,
    pub taller: Address,
    pub motivo: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApelacionResuelta {
    #[topic]
    pub placa: String,
    pub hash: BytesN<32>,
    pub aceptada: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AltaSolicitada {
    #[topic]
    pub taller: Address,
    pub huella: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SolicitudRechazada {
    #[topic]
    pub taller: Address,
    pub motivo: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FirmaDelegada {
    #[topic]
    pub taller: Address,
    pub empleado: Address,
    pub hasta: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegadoRevocado {
    #[topic]
    pub taller: Address,
    pub empleado: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistroDelegado {
    #[topic]
    pub placa: String,
    pub hash: BytesN<32>,
    pub taller: Address,
    pub empleado: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OperadorAsignado {
    #[topic]
    pub placa: String,
    pub operador: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KilometrajeRegistrado {
    #[topic]
    pub placa: String,
    pub km: u64,
    pub desde_servicio: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServicioProgramado {
    #[topic]
    pub placa: String,
    pub taller: Address,
    pub fecha: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CitaCancelada {
    #[topic]
    pub placa: String,
    pub taller: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoridadNombrada {
    #[topic]
    pub autoridad: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InspeccionVial {
    #[topic]
    pub placa: String,
    pub autoridad: Address,
    pub aprobada: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VigenciaProrrogada {
    #[topic]
    pub placa: String,
    pub hash: BytesN<32>,
    pub dias: u32,
    pub vigente_hasta: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReporteRetirado {
    #[topic]
    pub placa: String,
    pub reportante: Address,
    pub reportes: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminPropuesto {
    pub actual: Address,
    pub nuevo: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminCambiado {
    pub anterior: Address,
    pub nuevo: Address,
}

#[contract]
pub struct QrutaRegistry;

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&Clave::Admin).unwrap()
}

fn extender_instancia(env: &Env) {
    env.storage().instance().extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
}

fn extender(env: &Env, clave: &Clave) {
    env.storage().persistent().extend_ttl(clave, TTL_UMBRAL, TTL_EXTENDER);
}

/// Ledgers que debe vivir un dato para cubrir la vigencia más 30 días de margen
/// (nunca menos de TTL_EXTENDER ni más del máximo que permite la red).
fn ttl_para_vigencia(env: &Env, vigente_hasta: u64) -> u32 {
    let restante = vigente_hasta.saturating_sub(env.ledger().timestamp()) / 5;
    let deseado = u32::try_from(restante).unwrap_or(u32::MAX).saturating_add(TTL_UMBRAL).max(TTL_EXTENDER);
    deseado.min(env.storage().max_ttl())
}

fn extender_hasta(env: &Env, clave: &Clave, ttl: u32) {
    env.storage().persistent().extend_ttl(clave, ttl, ttl);
}

fn esta_aprobado(env: &Env, taller: &Address) -> bool {
    env.storage().persistent().get(&Clave::Taller(taller.clone())).unwrap_or(false)
}

/// Taller responsable de una placa: el que la recibió por `transferir_unidad` o, si nunca se transfirió,
/// el que firmó su expediente vigente.
fn custodio(env: &Env, placa: &String) -> Option<Address> {
    if let Some(a) = env.storage().persistent().get::<_, Address>(&Clave::Custodio(placa.clone())) {
        return Some(a);
    }
    let hash: BytesN<32> = env.storage().persistent().get(&Clave::Ultimo(placa.clone()))?;
    let registro: Registro = env.storage().persistent().get(&Clave::Expediente(hash))?;
    Some(registro.taller)
}

fn es_autoridad(env: &Env, cuenta: &Address) -> bool {
    env.storage().persistent().get(&Clave::Autoridad(cuenta.clone())).unwrap_or(false)
}

/// Pone la unidad en revisión por una causa que no son los reportes de pasajeros
/// (kilometraje excedido o inspección reprobada). Devuelve true si acaba de entrar en revisión.
fn revision_externa(env: &Env, placa: &String, evidencia: BytesN<32>) -> bool {
    let clave_rev = Clave::Revision(placa.clone());
    let mut rev = env.storage().persistent().get::<_, Revision>(&clave_rev).unwrap_or(Revision {
        reportes: 0,
        en_revision: false,
        desde_ledger: env.ledger().sequence(),
        ultima_evidencia: evidencia,
    });
    let entra = !rev.en_revision;
    rev.en_revision = true;
    env.storage().persistent().set(&clave_rev, &rev);
    extender(env, &clave_rev);
    let clave_causa = Clave::CausaExterna(placa.clone());
    env.storage().persistent().set(&clave_causa, &true);
    extender(env, &clave_causa);
    if entra {
        UnidadEnRevision { placa: placa.clone(), reportes: rev.reportes }.publish(env);
    }
    entra
}

fn de_baja(env: &Env, placa: &String) -> bool {
    env.storage().persistent().has(&Clave::Baja(placa.clone()))
}

fn motivo_valido(motivo: &String) -> bool {
    motivo.len() >= 3 && motivo.len() <= 200
}

/// Días de vigencia de cada tipo de servicio (los mismos que `lib/config.ts`). None = tipo inválido.
fn dias_vigencia(env: &Env, tipo: &Symbol) -> Option<u64> {
    if *tipo == Symbol::new(env, "preventivo") {
        Some(90)
    } else if *tipo == Symbol::new(env, "correctivo") {
        Some(30)
    } else if *tipo == Symbol::new(env, "verificacion") {
        Some(180)
    } else {
        None
    }
}

/// Valida y guarda un expediente (la firma del taller se exige antes de llamarla).
/// `sustituye`: expediente que este corrige; si era el estado de la placa, el nuevo toma su lugar.
#[allow(clippy::too_many_arguments)]
fn guardar_registro(
    env: &Env,
    taller: Address,
    placa: String,
    hash: BytesN<32>,
    tipo: Symbol,
    fecha: u64,
    vigente_hasta: u64,
    sustituye: Option<BytesN<32>>,
) -> Result<(), Error> {
    if !esta_aprobado(env, &taller) {
        return Err(Error::TallerNoAprobado);
    }
    if placa.len() < 3 || placa.len() > 10 {
        return Err(Error::PlacaInvalida);
    }
    if de_baja(env, &placa) {
        return Err(Error::UnidadDeBaja);
    }
    let dias = dias_vigencia(env, &tipo).ok_or(Error::TipoInvalido)?;
    if fecha > env.ledger().timestamp() + TOLERANCIA_FECHA {
        return Err(Error::FechaFutura);
    }
    // La app cuenta la vigencia hasta el final del día: como máximo (días + 1) desde la fecha.
    if vigente_hasta <= fecha || vigente_hasta - fecha > (dias + 1) * DIA {
        return Err(Error::VigenciaInvalida);
    }
    let clave_exp = Clave::Expediente(hash.clone());
    if env.storage().persistent().has(&clave_exp) {
        return Err(Error::ExpedienteDuplicado);
    }

    let registro = Registro {
        placa: placa.clone(),
        taller: taller.clone(),
        tipo,
        fecha,
        vigente_hasta,
        ledger: env.ledger().sequence(),
    };
    env.storage().persistent().set(&clave_exp, &registro);
    // Los datos viven al menos hasta que vence el servicio (antes se archivaban a los 120 días).
    let ttl = ttl_para_vigencia(env, vigente_hasta);
    extender_hasta(env, &clave_exp, ttl);
    extender_hasta(env, &Clave::Taller(taller.clone()), ttl);

    // El estado de la unidad lo define el servicio más reciente por fecha
    // (si empatan, el último registrado), igual que en la app. Una corrección ocupa el lugar del corregido.
    let clave_ult = Clave::Ultimo(placa.clone());
    let reemplazar = match env.storage().persistent().get::<_, BytesN<32>>(&clave_ult) {
        None => true,
        Some(actual) if Some(actual.clone()) == sustituye => true,
        Some(actual) => {
            let previo: Option<Registro> = env.storage().persistent().get(&Clave::Expediente(actual));
            previo.is_none_or(|p| fecha >= p.fecha)
        }
    };
    if reemplazar {
        env.storage().persistent().set(&clave_ult, &hash);
    }
    extender_hasta(env, &clave_ult, ttl);
    env.storage().instance().extend_ttl(ttl, ttl);

    ExpedienteRegistrado { placa, hash, taller, vigente_hasta }.publish(env);
    Ok(())
}

#[contractimpl]
impl QrutaRegistry {
    /// Se ejecuta una sola vez al desplegar: fija la cuenta admin de QRuta.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&Clave::Admin, &admin);
        extender_instancia(&env);
    }

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }

    /// KYB aprobado: el taller puede firmar expedientes. Solo el admin.
    pub fn aprobar_taller(env: Env, taller: Address) {
        admin(&env).require_auth();
        let clave = Clave::Taller(taller.clone());
        env.storage().persistent().set(&clave, &true);
        extender(&env, &clave);
        env.storage().persistent().remove(&Clave::Solicitud(taller.clone()));
        extender_instancia(&env);
        TallerAprobado { taller }.publish(&env);
    }

    /// Suspende a un taller: ya no puede firmar. Sus expedientes anteriores siguen siendo válidos.
    pub fn suspender_taller(env: Env, taller: Address) {
        admin(&env).require_auth();
        let clave = Clave::Taller(taller.clone());
        env.storage().persistent().set(&clave, &false);
        extender(&env, &clave);
        TallerSuspendido { taller }.publish(&env);
    }

    pub fn es_aprobado(env: Env, taller: Address) -> bool {
        esta_aprobado(&env, &taller)
    }

    /// Registra un expediente firmado por el taller.
    pub fn registrar(
        env: Env,
        taller: Address,
        placa: String,
        hash: BytesN<32>,
        tipo: Symbol,
        fecha: u64,
        vigente_hasta: u64,
    ) -> Result<(), Error> {
        // La firma es del taller, no de QRuta.
        taller.require_auth();
        guardar_registro(&env, taller, placa, hash, tipo, fecha, vigente_hasta, None)
    }

    /// Mantiene en la red el estado de una placa: extiende el último expediente, el puntero de la placa
    /// y la aprobación de su taller para que no se archiven antes de que venza el servicio.
    /// Cualquiera puede llamarla (quien la llama paga la comisión). Devuelve el TTL aplicado, en ledgers.
    pub fn renovar(env: Env, placa: String) -> Result<u32, Error> {
        if de_baja(&env, &placa) {
            return Err(Error::UnidadDeBaja);
        }
        let clave_ult = Clave::Ultimo(placa.clone());
        let hash: BytesN<32> = env.storage().persistent().get(&clave_ult).ok_or(Error::PlacaSinRegistro)?;
        let clave_exp = Clave::Expediente(hash.clone());
        let registro: Registro = env.storage().persistent().get(&clave_exp).ok_or(Error::PlacaSinRegistro)?;

        let ttl = ttl_para_vigencia(&env, registro.vigente_hasta);
        extender_hasta(&env, &clave_ult, ttl);
        extender_hasta(&env, &clave_exp, ttl);
        let clave_taller = Clave::Taller(registro.taller);
        if env.storage().persistent().has(&clave_taller) {
            extender_hasta(&env, &clave_taller, ttl);
        }
        env.storage().instance().extend_ttl(ttl, ttl);

        UnidadRenovada { placa, hash, ttl }.publish(&env);
        Ok(ttl)
    }

    /// Anula un expediente (por ejemplo, un servicio registrado con datos falsos). Solo el admin.
    /// El registro se conserva como evidencia; si era el estado vigente de la placa, la placa queda
    /// sin servicio vigente hasta que un taller registre uno nuevo.
    pub fn anular_expediente(env: Env, hash: BytesN<32>, motivo: String) -> Result<(), Error> {
        admin(&env).require_auth();
        if !motivo_valido(&motivo) {
            return Err(Error::MotivoInvalido);
        }
        let registro: Registro =
            env.storage().persistent().get(&Clave::Expediente(hash.clone())).ok_or(Error::ExpedienteNoExiste)?;
        let clave_anulado = Clave::Anulado(hash.clone());
        if env.storage().persistent().has(&clave_anulado) {
            return Err(Error::ExpedienteAnulado);
        }

        env.storage()
            .persistent()
            .set(&clave_anulado, &Anulacion { motivo: motivo.clone(), ledger: env.ledger().sequence() });
        extender(&env, &clave_anulado);

        let clave_ult = Clave::Ultimo(registro.placa.clone());
        if env.storage().persistent().get::<_, BytesN<32>>(&clave_ult) == Some(hash.clone()) {
            env.storage().persistent().remove(&clave_ult);
        }
        extender_instancia(&env);

        ExpedienteAnulado { placa: registro.placa, hash, motivo }.publish(&env);
        Ok(())
    }

    /// El taller que firmó un expediente registra una versión corregida (por ejemplo, un kilometraje
    /// mal capturado). El anterior queda anulado con el motivo y enlazado al nuevo; si era el estado
    /// de la placa, el nuevo toma su lugar. La placa no cambia: un error de placa se anula y se registra de nuevo.
    #[allow(clippy::too_many_arguments)]
    pub fn corregir_expediente(
        env: Env,
        taller: Address,
        anterior: BytesN<32>,
        hash: BytesN<32>,
        tipo: Symbol,
        fecha: u64,
        vigente_hasta: u64,
        motivo: String,
    ) -> Result<(), Error> {
        taller.require_auth();
        if !motivo_valido(&motivo) {
            return Err(Error::MotivoInvalido);
        }
        let previo: Registro =
            env.storage().persistent().get(&Clave::Expediente(anterior.clone())).ok_or(Error::ExpedienteNoExiste)?;
        if previo.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        let clave_corregido = Clave::CorregidoPor(anterior.clone());
        if env.storage().persistent().has(&clave_corregido) {
            return Err(Error::ExpedienteYaCorregido);
        }
        let clave_anulado = Clave::Anulado(anterior.clone());
        if env.storage().persistent().has(&clave_anulado) {
            return Err(Error::ExpedienteAnulado);
        }

        let placa = previo.placa;
        guardar_registro(&env, taller, placa.clone(), hash.clone(), tipo, fecha, vigente_hasta, Some(anterior.clone()))?;

        let anulacion = Anulacion { motivo: motivo.clone(), ledger: env.ledger().sequence() };
        env.storage().persistent().set(&clave_anulado, &anulacion);
        env.storage().persistent().set(&clave_corregido, &hash);
        extender(&env, &clave_anulado);
        extender(&env, &clave_corregido);

        ExpedienteCorregido { placa, anterior, nuevo: hash, motivo }.publish(&env);
        Ok(())
    }

    /// Registra de una vez varios expedientes del mismo taller (por ejemplo, el servicio de toda una flota).
    /// Cada uno pasa las mismas validaciones que `registrar`; si uno falla, no se guarda ninguno.
    /// Devuelve cuántos registró.
    pub fn registrar_lote(env: Env, taller: Address, lote: Vec<ExpedienteLote>) -> Result<u32, Error> {
        taller.require_auth();
        let n = lote.len();
        if n == 0 || n > LOTE_MAXIMO {
            return Err(Error::LoteInvalido);
        }
        for e in lote.iter() {
            guardar_registro(&env, taller.clone(), e.placa, e.hash, e.tipo, e.fecha, e.vigente_hasta, None)?;
        }
        LoteRegistrado { taller, expedientes: n }.publish(&env);
        Ok(n)
    }

    /// Un pasajero reporta una falla de la unidad con la huella de su evidencia.
    /// Firma el pasajero; solo cuenta un reporte por pasajero, placa y día.
    /// Al llegar a 3 reportes la unidad queda en revisión hasta que un taller la atienda.
    /// Devuelve los reportes acumulados.
    pub fn reportar_falla(env: Env, reportante: Address, placa: String, evidencia: BytesN<32>) -> Result<u32, Error> {
        reportante.require_auth();
        if !env.storage().persistent().has(&Clave::Ultimo(placa.clone())) {
            return Err(Error::PlacaSinRegistro);
        }
        if de_baja(&env, &placa) {
            return Err(Error::UnidadDeBaja);
        }
        let hoy = env.ledger().timestamp() / DIA;
        let clave_de = Clave::ReporteDe(placa.clone(), reportante.clone());
        if env.storage().persistent().get::<_, u64>(&clave_de) == Some(hoy) {
            return Err(Error::ReporteRepetido);
        }
        env.storage().persistent().set(&clave_de, &hoy);
        extender(&env, &clave_de);

        let clave_rev = Clave::Revision(placa.clone());
        let mut rev = env.storage().persistent().get::<_, Revision>(&clave_rev).unwrap_or(Revision {
            reportes: 0,
            en_revision: false,
            desde_ledger: env.ledger().sequence(),
            ultima_evidencia: evidencia.clone(),
        });
        rev.reportes += 1;
        rev.ultima_evidencia = evidencia.clone();
        let entra_en_revision = !rev.en_revision && rev.reportes >= REPORTES_PARA_REVISION;
        if entra_en_revision {
            rev.en_revision = true;
        }
        env.storage().persistent().set(&clave_rev, &rev);
        extender(&env, &clave_rev);
        let clave_ciclo = Clave::ReporteCiclo(placa.clone(), reportante.clone());
        env.storage().persistent().set(&clave_ciclo, &env.ledger().sequence());
        extender(&env, &clave_ciclo);
        extender_instancia(&env);

        FallaReportada { placa: placa.clone(), reportante, evidencia, reportes: rev.reportes }.publish(&env);
        if entra_en_revision {
            UnidadEnRevision { placa, reportes: rev.reportes }.publish(&env);
        }
        Ok(rev.reportes)
    }

    /// El taller atiende los reportes de una unidad con un servicio que él firmó después del primer reporte.
    /// Los reportes vuelven a cero y la unidad sale de revisión.
    pub fn atender_reporte(env: Env, taller: Address, placa: String, hash: BytesN<32>) -> Result<(), Error> {
        taller.require_auth();
        if !esta_aprobado(&env, &taller) {
            return Err(Error::TallerNoAprobado);
        }
        let clave_rev = Clave::Revision(placa.clone());
        let rev: Revision = env.storage().persistent().get(&clave_rev).ok_or(Error::SinReportes)?;
        let registro: Registro =
            env.storage().persistent().get(&Clave::Expediente(hash.clone())).ok_or(Error::ExpedienteNoExiste)?;
        if registro.placa != placa {
            return Err(Error::ExpedienteDeOtraPlaca);
        }
        if registro.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if env.storage().persistent().has(&Clave::Anulado(hash.clone())) {
            return Err(Error::ExpedienteAnulado);
        }
        if registro.ledger <= rev.desde_ledger {
            return Err(Error::ExpedienteAnterior);
        }
        env.storage().persistent().remove(&clave_rev);
        env.storage().persistent().remove(&Clave::CausaExterna(placa.clone()));
        extender_instancia(&env);
        ReporteAtendido { placa, taller, hash, reportes: rev.reportes }.publish(&env);
        Ok(())
    }

    /// Un segundo taller aprobado avala un expediente (doble revisión). No puede ser el taller que lo
    /// firmó, el expediente no debe estar anulado y solo se avala una vez.
    pub fn cofirmar_expediente(env: Env, inspector: Address, hash: BytesN<32>) -> Result<(), Error> {
        inspector.require_auth();
        if !esta_aprobado(&env, &inspector) {
            return Err(Error::TallerNoAprobado);
        }
        let registro: Registro =
            env.storage().persistent().get(&Clave::Expediente(hash.clone())).ok_or(Error::ExpedienteNoExiste)?;
        if registro.taller == inspector {
            return Err(Error::MismoTaller);
        }
        if env.storage().persistent().has(&Clave::Anulado(hash.clone())) {
            return Err(Error::ExpedienteAnulado);
        }
        let clave = Clave::Cofirma(hash.clone());
        if env.storage().persistent().has(&clave) {
            return Err(Error::YaCofirmado);
        }
        env.storage().persistent().set(&clave, &Cofirma { inspector: inspector.clone(), ledger: env.ledger().sequence() });
        extender_hasta(&env, &clave, ttl_para_vigencia(&env, registro.vigente_hasta));
        extender_instancia(&env);
        ExpedienteCofirmado { placa: registro.placa, hash, inspector }.publish(&env);
        Ok(())
    }

    /// El taller responsable de una unidad la entrega a otro taller aprobado (cambio de concesión o de taller).
    pub fn transferir_unidad(env: Env, taller: Address, placa: String, nuevo: Address) -> Result<(), Error> {
        taller.require_auth();
        let actual = custodio(&env, &placa).ok_or(Error::PlacaSinRegistro)?;
        if actual != taller {
            return Err(Error::NoEsCustodio);
        }
        if nuevo == taller {
            return Err(Error::MismoTaller);
        }
        if !esta_aprobado(&env, &taller) || !esta_aprobado(&env, &nuevo) {
            return Err(Error::TallerNoAprobado);
        }
        let clave = Clave::Custodio(placa.clone());
        env.storage().persistent().set(&clave, &nuevo);
        extender(&env, &clave);
        extender_instancia(&env);
        UnidadTransferida { placa, de: taller, a: nuevo }.publish(&env);
        Ok(())
    }

    /// Retira una unidad de circulación (siniestro, fin de concesión, chatarrización).
    /// Firma el admin o el taller responsable de la placa. Mientras esté de baja no se registran,
    /// corrigen ni renuevan sus servicios, no recibe reportes y su estado público deja de ser vigente.
    pub fn dar_de_baja(env: Env, quien: Address, placa: String, motivo: String) -> Result<(), Error> {
        quien.require_auth();
        if !motivo_valido(&motivo) {
            return Err(Error::MotivoInvalido);
        }
        let responsable = custodio(&env, &placa).ok_or(Error::PlacaSinRegistro)?;
        if quien != admin(&env) && quien != responsable {
            return Err(Error::NoAutorizado);
        }
        let clave = Clave::Baja(placa.clone());
        if env.storage().persistent().has(&clave) {
            return Err(Error::UnidadDeBaja);
        }
        env.storage()
            .persistent()
            .set(&clave, &Baja { motivo: motivo.clone(), por: quien.clone(), ledger: env.ledger().sequence() });
        extender(&env, &clave);
        extender_instancia(&env);
        UnidadDadaDeBaja { placa, por: quien, motivo }.publish(&env);
        Ok(())
    }

    /// Regresa a circulación una unidad dada de baja. Solo el admin.
    /// Sus servicios anteriores siguen contando: si alguno sigue vigente, la unidad vuelve vigente.
    pub fn reactivar_unidad(env: Env, placa: String) -> Result<(), Error> {
        admin(&env).require_auth();
        let clave = Clave::Baja(placa.clone());
        if !env.storage().persistent().has(&clave) {
            return Err(Error::NoEstaDeBaja);
        }
        env.storage().persistent().remove(&clave);
        extender_instancia(&env);
        UnidadReactivada { placa }.publish(&env);
        Ok(())
    }

    /// El taller que firmó un expediente anulado por el admin pide que se revise la anulación.
    /// Una sola apelación por expediente; no aplica a los expedientes que el propio taller corrigió.
    pub fn apelar_anulacion(env: Env, taller: Address, hash: BytesN<32>, motivo: String) -> Result<(), Error> {
        taller.require_auth();
        if !motivo_valido(&motivo) {
            return Err(Error::MotivoInvalido);
        }
        if !esta_aprobado(&env, &taller) {
            return Err(Error::TallerNoAprobado);
        }
        let registro: Registro =
            env.storage().persistent().get(&Clave::Expediente(hash.clone())).ok_or(Error::ExpedienteNoExiste)?;
        if registro.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if !env.storage().persistent().has(&Clave::Anulado(hash.clone())) {
            return Err(Error::NoEstaAnulado);
        }
        if env.storage().persistent().has(&Clave::CorregidoPor(hash.clone())) {
            return Err(Error::ExpedienteYaCorregido);
        }
        let clave = Clave::Apelacion(hash.clone());
        if env.storage().persistent().has(&clave) {
            return Err(Error::YaApelado);
        }
        let apelacion =
            Apelacion { motivo: motivo.clone(), ledger: env.ledger().sequence(), resuelta: false, aceptada: false };
        env.storage().persistent().set(&clave, &apelacion);
        extender(&env, &clave);
        extender_instancia(&env);
        AnulacionApelada { placa: registro.placa, hash, taller, motivo }.publish(&env);
        Ok(())
    }

    /// El admin resuelve una apelación abierta. Si la acepta, se quita la anulación y el expediente
    /// vuelve a definir el estado de la placa si es su servicio más reciente.
    pub fn resolver_apelacion(env: Env, hash: BytesN<32>, aceptar: bool) -> Result<(), Error> {
        admin(&env).require_auth();
        let clave = Clave::Apelacion(hash.clone());
        let mut apelacion: Apelacion = env.storage().persistent().get(&clave).ok_or(Error::SinApelacion)?;
        if apelacion.resuelta {
            return Err(Error::SinApelacion);
        }
        let registro: Registro =
            env.storage().persistent().get(&Clave::Expediente(hash.clone())).ok_or(Error::ExpedienteNoExiste)?;

        if aceptar {
            env.storage().persistent().remove(&Clave::Anulado(hash.clone()));
            let clave_ult = Clave::Ultimo(registro.placa.clone());
            let recupera = match env.storage().persistent().get::<_, BytesN<32>>(&clave_ult) {
                None => true,
                Some(actual) => {
                    let previo: Option<Registro> = env.storage().persistent().get(&Clave::Expediente(actual));
                    previo.is_none_or(|p| registro.fecha >= p.fecha)
                }
            };
            if recupera {
                env.storage().persistent().set(&clave_ult, &hash);
                extender_hasta(&env, &clave_ult, ttl_para_vigencia(&env, registro.vigente_hasta));
            }
        }
        apelacion.resuelta = true;
        apelacion.aceptada = aceptar;
        env.storage().persistent().set(&clave, &apelacion);
        extender(&env, &clave);
        extender_instancia(&env);
        ApelacionResuelta { placa: registro.placa, hash, aceptada: aceptar }.publish(&env);
        Ok(())
    }

    // ── v5: alta de talleres y firma delegada ──

    /// Un taller pide su alta en QRuta con la huella de su RFC y documentos. Una solicitud abierta a la vez.
    pub fn solicitar_alta(env: Env, taller: Address, huella_rfc: BytesN<32>) -> Result<(), Error> {
        taller.require_auth();
        if esta_aprobado(&env, &taller) {
            return Err(Error::YaAprobado);
        }
        if es_autoridad(&env, &taller) {
            return Err(Error::YaEsAutoridad);
        }
        let clave = Clave::Solicitud(taller.clone());
        if env.storage().persistent().has(&clave) {
            return Err(Error::SolicitudAbierta);
        }
        env.storage().persistent().set(&clave, &Solicitud { huella: huella_rfc.clone(), ledger: env.ledger().sequence() });
        extender(&env, &clave);
        extender_instancia(&env);
        AltaSolicitada { taller, huella: huella_rfc }.publish(&env);
        Ok(())
    }

    /// El admin rechaza una solicitud de alta con su motivo. El taller puede volver a solicitar.
    pub fn rechazar_solicitud(env: Env, taller: Address, motivo: String) -> Result<(), Error> {
        admin(&env).require_auth();
        if !motivo_valido(&motivo) {
            return Err(Error::MotivoInvalido);
        }
        let clave = Clave::Solicitud(taller.clone());
        if !env.storage().persistent().has(&clave) {
            return Err(Error::SinSolicitud);
        }
        env.storage().persistent().remove(&clave);
        extender_instancia(&env);
        SolicitudRechazada { taller, motivo }.publish(&env);
        Ok(())
    }

    /// El taller autoriza a un empleado a registrar servicios a su nombre hasta `hasta` (máximo 90 días).
    pub fn delegar_firma(env: Env, taller: Address, empleado: Address, hasta: u64) -> Result<(), Error> {
        taller.require_auth();
        if !esta_aprobado(&env, &taller) {
            return Err(Error::TallerNoAprobado);
        }
        if empleado == taller {
            return Err(Error::MismoTaller);
        }
        let ahora = env.ledger().timestamp();
        if hasta <= ahora || hasta - ahora > DELEGACION_MAXIMA {
            return Err(Error::FechaInvalida);
        }
        let clave = Clave::Delegado(taller.clone(), empleado.clone());
        env.storage().persistent().set(&clave, &hasta);
        extender(&env, &clave);
        extender_instancia(&env);
        FirmaDelegada { taller, empleado, hasta }.publish(&env);
        Ok(())
    }

    /// El taller quita la delegación a un empleado.
    pub fn revocar_delegado(env: Env, taller: Address, empleado: Address) -> Result<(), Error> {
        taller.require_auth();
        let clave = Clave::Delegado(taller.clone(), empleado.clone());
        if !env.storage().persistent().has(&clave) {
            return Err(Error::SinDelegacion);
        }
        env.storage().persistent().remove(&clave);
        extender_instancia(&env);
        DelegadoRevocado { taller, empleado }.publish(&env);
        Ok(())
    }

    /// Un empleado con delegación vigente registra un servicio a nombre del taller.
    /// Firma el empleado; el expediente queda a nombre del taller y pasa las reglas de `registrar`.
    #[allow(clippy::too_many_arguments)]
    pub fn registrar_como_delegado(
        env: Env,
        empleado: Address,
        taller: Address,
        placa: String,
        hash: BytesN<32>,
        tipo: Symbol,
        fecha: u64,
        vigente_hasta: u64,
    ) -> Result<(), Error> {
        empleado.require_auth();
        let hasta: u64 = env
            .storage()
            .persistent()
            .get(&Clave::Delegado(taller.clone(), empleado.clone()))
            .ok_or(Error::SinDelegacion)?;
        if hasta < env.ledger().timestamp() {
            return Err(Error::SinDelegacion);
        }
        guardar_registro(&env, taller.clone(), placa.clone(), hash.clone(), tipo, fecha, vigente_hasta, None)?;
        RegistroDelegado { placa, hash, taller, empleado }.publish(&env);
        Ok(())
    }

    // ── v5: unidad en operación ──

    /// El taller responsable asigna el operador (chofer) de la unidad. Un operador maneja una sola unidad.
    pub fn asignar_operador(env: Env, taller: Address, placa: String, operador: Address) -> Result<(), Error> {
        taller.require_auth();
        let responsable = custodio(&env, &placa).ok_or(Error::PlacaSinRegistro)?;
        if responsable != taller {
            return Err(Error::NoEsCustodio);
        }
        if !esta_aprobado(&env, &taller) {
            return Err(Error::TallerNoAprobado);
        }
        if operador == taller {
            return Err(Error::MismoTaller);
        }
        if de_baja(&env, &placa) {
            return Err(Error::UnidadDeBaja);
        }
        let clave_de = Clave::OperadorDe(operador.clone());
        if let Some(otra) = env.storage().persistent().get::<_, String>(&clave_de) {
            if otra != placa {
                return Err(Error::OperadorOcupado);
            }
        }
        let clave_op = Clave::Operador(placa.clone());
        if let Some(anterior) = env.storage().persistent().get::<_, Address>(&clave_op) {
            env.storage().persistent().remove(&Clave::OperadorDe(anterior));
        }
        env.storage().persistent().set(&clave_op, &operador);
        env.storage().persistent().set(&clave_de, &placa);
        extender(&env, &clave_op);
        extender(&env, &clave_de);
        extender_instancia(&env);
        OperadorAsignado { placa, operador }.publish(&env);
        Ok(())
    }

    /// El operador asignado registra la lectura del odómetro; solo puede subir.
    /// Si pasa de 10,000 km desde el servicio vigente, la unidad queda en revisión.
    /// Devuelve los km recorridos desde ese servicio.
    pub fn registrar_kilometraje(env: Env, operador: Address, placa: String, km: u64) -> Result<u64, Error> {
        operador.require_auth();
        if env.storage().persistent().get::<_, Address>(&Clave::Operador(placa.clone())) != Some(operador) {
            return Err(Error::NoEsOperador);
        }
        if de_baja(&env, &placa) {
            return Err(Error::UnidadDeBaja);
        }
        let servicio: BytesN<32> =
            env.storage().persistent().get(&Clave::Ultimo(placa.clone())).ok_or(Error::PlacaSinRegistro)?;
        let clave = Clave::Kilometraje(placa.clone());
        let previo: Option<Kilometraje> = env.storage().persistent().get(&clave);
        if let Some(p) = &previo {
            if km <= p.ultimo {
                return Err(Error::KilometrajeInvalido);
            }
        }
        let base = match previo {
            Some(p) if p.hash_base == servicio => p.base,
            _ => km,
        };
        env.storage().persistent().set(&clave, &Kilometraje { ultimo: km, base, hash_base: servicio.clone() });
        extender(&env, &clave);
        let recorridos = km - base;
        if recorridos > KM_PARA_REVISION {
            revision_externa(&env, &placa, servicio);
        }
        extender_instancia(&env);
        KilometrajeRegistrado { placa, km, desde_servicio: recorridos }.publish(&env);
        Ok(recorridos)
    }

    /// El taller responsable programa el siguiente servicio: fecha futura y como máximo 30 días después
    /// de que vence el servicio vigente. Una cita abierta a la vez.
    pub fn programar_servicio(env: Env, taller: Address, placa: String, fecha: u64) -> Result<(), Error> {
        taller.require_auth();
        let responsable = custodio(&env, &placa).ok_or(Error::PlacaSinRegistro)?;
        if responsable != taller {
            return Err(Error::NoEsCustodio);
        }
        if !esta_aprobado(&env, &taller) {
            return Err(Error::TallerNoAprobado);
        }
        if de_baja(&env, &placa) {
            return Err(Error::UnidadDeBaja);
        }
        let ahora = env.ledger().timestamp();
        let hash: BytesN<32> =
            env.storage().persistent().get(&Clave::Ultimo(placa.clone())).ok_or(Error::PlacaSinRegistro)?;
        let registro: Registro =
            env.storage().persistent().get(&Clave::Expediente(hash)).ok_or(Error::PlacaSinRegistro)?;
        if fecha <= ahora || fecha > registro.vigente_hasta.max(ahora) + CITA_MARGEN {
            return Err(Error::FechaInvalida);
        }
        let clave = Clave::Cita(placa.clone());
        if let Some(c) = env.storage().persistent().get::<_, Cita>(&clave) {
            if c.fecha > ahora {
                return Err(Error::CitaAbierta);
            }
        }
        env.storage().persistent().set(&clave, &Cita { taller: taller.clone(), fecha });
        extender(&env, &clave);
        extender_instancia(&env);
        ServicioProgramado { placa, taller, fecha }.publish(&env);
        Ok(())
    }

    /// Quien programó la cita la cancela antes de que llegue la fecha.
    pub fn cancelar_cita(env: Env, taller: Address, placa: String) -> Result<(), Error> {
        taller.require_auth();
        let clave = Clave::Cita(placa.clone());
        let cita: Cita = env.storage().persistent().get(&clave).ok_or(Error::SinCita)?;
        if cita.taller != taller {
            return Err(Error::NoEsDelTaller);
        }
        if cita.fecha <= env.ledger().timestamp() {
            return Err(Error::FechaInvalida);
        }
        env.storage().persistent().remove(&clave);
        extender_instancia(&env);
        CitaCancelada { placa, taller }.publish(&env);
        Ok(())
    }

    // ── v5: autoridad ──

    /// El admin da de alta una cuenta de la autoridad de movilidad. No puede ser un taller.
    pub fn nombrar_autoridad(env: Env, cuenta: Address) -> Result<(), Error> {
        admin(&env).require_auth();
        if env.storage().persistent().has(&Clave::Taller(cuenta.clone())) {
            return Err(Error::EsTaller);
        }
        let clave = Clave::Autoridad(cuenta.clone());
        if env.storage().persistent().has(&clave) {
            return Err(Error::YaEsAutoridad);
        }
        env.storage().persistent().set(&clave, &true);
        extender(&env, &clave);
        extender_instancia(&env);
        AutoridadNombrada { autoridad: cuenta }.publish(&env);
        Ok(())
    }

    /// La autoridad registra una inspección en la vía pública. Si la reprueba, la unidad queda en revisión
    /// hasta que el taller la atienda con un servicio nuevo.
    pub fn inspeccion_vial(
        env: Env,
        autoridad: Address,
        placa: String,
        aprobada: bool,
        evidencia: BytesN<32>,
    ) -> Result<(), Error> {
        autoridad.require_auth();
        if !es_autoridad(&env, &autoridad) {
            return Err(Error::NoEsAutoridad);
        }
        if !env.storage().persistent().has(&Clave::Ultimo(placa.clone())) {
            return Err(Error::PlacaSinRegistro);
        }
        let clave = Clave::Inspeccion(placa.clone());
        let inspeccion =
            Inspeccion { autoridad: autoridad.clone(), aprobada, evidencia: evidencia.clone(), ledger: env.ledger().sequence() };
        env.storage().persistent().set(&clave, &inspeccion);
        extender(&env, &clave);
        if !aprobada {
            revision_externa(&env, &placa, evidencia);
        }
        extender_instancia(&env);
        InspeccionVial { placa, autoridad, aprobada }.publish(&env);
        Ok(())
    }

    /// La autoridad prorroga la vigencia de un expediente (por ejemplo, talleres saturados),
    /// de 1 a 15 días y una sola vez. Devuelve la nueva fecha de vencimiento.
    pub fn prorrogar_vigencia(env: Env, autoridad: Address, hash: BytesN<32>, dias: u32) -> Result<u64, Error> {
        autoridad.require_auth();
        if !es_autoridad(&env, &autoridad) {
            return Err(Error::NoEsAutoridad);
        }
        if dias == 0 || dias > PRORROGA_MAXIMA {
            return Err(Error::ProrrogaInvalida);
        }
        let clave_exp = Clave::Expediente(hash.clone());
        let mut registro: Registro = env.storage().persistent().get(&clave_exp).ok_or(Error::ExpedienteNoExiste)?;
        if env.storage().persistent().has(&Clave::Anulado(hash.clone())) {
            return Err(Error::ExpedienteAnulado);
        }
        let clave = Clave::Prorroga(hash.clone());
        if env.storage().persistent().has(&clave) {
            return Err(Error::YaProrrogado);
        }
        registro.vigente_hasta += dias as u64 * DIA;
        env.storage().persistent().set(&clave_exp, &registro);
        env.storage().persistent().set(&clave, &dias);
        let ttl = ttl_para_vigencia(&env, registro.vigente_hasta);
        extender_hasta(&env, &clave_exp, ttl);
        extender_hasta(&env, &clave, ttl);
        extender_instancia(&env);
        VigenciaProrrogada { placa: registro.placa, hash, dias, vigente_hasta: registro.vigente_hasta }.publish(&env);
        Ok(registro.vigente_hasta)
    }

    // ── v5: pasajeros y gobierno del contrato ──

    /// El pasajero retira su reporte del ciclo abierto. Si los reportes bajan de 3 y no hay otra causa
    /// (kilometraje o inspección), la unidad sale de revisión. Devuelve los reportes que quedan.
    pub fn retirar_reporte(env: Env, reportante: Address, placa: String) -> Result<u32, Error> {
        reportante.require_auth();
        let clave_rev = Clave::Revision(placa.clone());
        let mut rev: Revision = env.storage().persistent().get(&clave_rev).ok_or(Error::SinReportes)?;
        let clave_ciclo = Clave::ReporteCiclo(placa.clone(), reportante.clone());
        let ledger: u32 = env.storage().persistent().get(&clave_ciclo).ok_or(Error::SinReportes)?;
        if ledger < rev.desde_ledger || rev.reportes == 0 {
            return Err(Error::SinReportes);
        }
        env.storage().persistent().remove(&clave_ciclo);
        rev.reportes -= 1;
        let externa: bool = env.storage().persistent().get(&Clave::CausaExterna(placa.clone())).unwrap_or(false);
        rev.en_revision = externa || rev.reportes >= REPORTES_PARA_REVISION;
        if rev.reportes == 0 && !rev.en_revision {
            env.storage().persistent().remove(&clave_rev);
        } else {
            env.storage().persistent().set(&clave_rev, &rev);
            extender(&env, &clave_rev);
        }
        extender_instancia(&env);
        ReporteRetirado { placa, reportante, reportes: rev.reportes }.publish(&env);
        Ok(rev.reportes)
    }

    /// Primer paso para cambiar la cuenta admin: el admin actual propone a la nueva.
    /// El cambio solo ocurre cuando la nueva acepta, para no perder el contrato por una dirección mal escrita.
    pub fn proponer_admin(env: Env, nuevo: Address) -> Result<(), Error> {
        let actual = admin(&env);
        actual.require_auth();
        if nuevo == actual {
            return Err(Error::MismoAdmin);
        }
        env.storage().instance().set(&Clave::AdminPropuesto, &nuevo);
        extender_instancia(&env);
        AdminPropuesto { actual, nuevo }.publish(&env);
        Ok(())
    }

    /// Segundo paso: la cuenta propuesta firma y se vuelve el admin.
    pub fn aceptar_admin(env: Env, nuevo: Address) -> Result<(), Error> {
        nuevo.require_auth();
        let propuesto: Address = env.storage().instance().get(&Clave::AdminPropuesto).ok_or(Error::SinPropuesta)?;
        if propuesto != nuevo {
            return Err(Error::SinPropuesta);
        }
        let anterior = admin(&env);
        env.storage().instance().set(&Clave::Admin, &nuevo);
        env.storage().instance().remove(&Clave::AdminPropuesto);
        extender_instancia(&env);
        AdminCambiado { anterior, nuevo }.publish(&env);
        Ok(())
    }

    pub fn solicitud(env: Env, taller: Address) -> Option<Solicitud> {
        env.storage().persistent().get(&Clave::Solicitud(taller))
    }

    /// Fin de la delegación de un empleado, si la tiene.
    pub fn delegacion(env: Env, taller: Address, empleado: Address) -> Option<u64> {
        env.storage().persistent().get(&Clave::Delegado(taller, empleado))
    }

    pub fn operador(env: Env, placa: String) -> Option<Address> {
        env.storage().persistent().get(&Clave::Operador(placa))
    }

    pub fn kilometraje(env: Env, placa: String) -> Option<Kilometraje> {
        env.storage().persistent().get(&Clave::Kilometraje(placa))
    }

    pub fn cita(env: Env, placa: String) -> Option<Cita> {
        env.storage().persistent().get(&Clave::Cita(placa))
    }

    pub fn es_autoridad(env: Env, cuenta: Address) -> bool {
        es_autoridad(&env, &cuenta)
    }

    pub fn inspeccion(env: Env, placa: String) -> Option<Inspeccion> {
        env.storage().persistent().get(&Clave::Inspeccion(placa))
    }

    pub fn admin_propuesto(env: Env) -> Option<Address> {
        env.storage().instance().get(&Clave::AdminPropuesto)
    }

    /// Baja de una unidad, si la tiene.
    pub fn baja(env: Env, placa: String) -> Option<Baja> {
        env.storage().persistent().get(&Clave::Baja(placa))
    }

    /// Apelación de un expediente, si la tiene.
    pub fn apelacion(env: Env, hash: BytesN<32>) -> Option<Apelacion> {
        env.storage().persistent().get(&Clave::Apelacion(hash))
    }

    /// Reportes pendientes de una unidad, si los tiene.
    pub fn revision(env: Env, placa: String) -> Option<Revision> {
        env.storage().persistent().get(&Clave::Revision(placa))
    }

    /// Aval de un expediente, si lo tiene.
    pub fn cofirma(env: Env, hash: BytesN<32>) -> Option<Cofirma> {
        env.storage().persistent().get(&Clave::Cofirma(hash))
    }

    /// Taller responsable de una placa.
    pub fn custodio(env: Env, placa: String) -> Option<Address> {
        custodio(&env, &placa)
    }

    /// Hash del expediente que corrigió a este, si lo hay.
    pub fn correccion(env: Env, hash: BytesN<32>) -> Option<BytesN<32>> {
        env.storage().persistent().get(&Clave::CorregidoPor(hash))
    }

    /// Anulación de un expediente, si la tiene.
    pub fn anulacion(env: Env, hash: BytesN<32>) -> Option<Anulacion> {
        env.storage().persistent().get(&Clave::Anulado(hash))
    }

    /// Expediente por su hash (para comprobar la integridad de cualquier servicio, no solo el último).
    pub fn expediente(env: Env, hash: BytesN<32>) -> Option<Registro> {
        env.storage().persistent().get(&Clave::Expediente(hash))
    }

    /// Estado público de una placa, calculado con la hora del ledger.
    /// Una unidad dada de baja nunca aparece como vigente.
    pub fn estado(env: Env, placa: String) -> Option<EstadoUnidad> {
        let hash: BytesN<32> = env.storage().persistent().get(&Clave::Ultimo(placa.clone()))?;
        let registro: Registro = env.storage().persistent().get(&Clave::Expediente(hash.clone()))?;
        let vigente = registro.vigente_hasta >= env.ledger().timestamp() && !de_baja(&env, &placa);
        Some(EstadoUnidad { hash, registro, vigente })
    }

    /// Actualiza el código del contrato conservando sus datos. Solo el admin.
    pub fn actualizar(env: Env, wasm_hash: BytesN<32>) {
        admin(&env).require_auth();
        env.deployer().update_current_contract(ContractExecutable::Wasm(wasm_hash));
    }
}

#[cfg(test)]
mod test;
