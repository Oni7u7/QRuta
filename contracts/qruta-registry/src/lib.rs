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
