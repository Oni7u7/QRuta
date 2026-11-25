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
    Symbol,
};

// Un ledger cada ~5 s.
const DIA_EN_LEDGERS: u32 = 17_280;
const TTL_UMBRAL: u32 = 30 * DIA_EN_LEDGERS;
const TTL_EXTENDER: u32 = 120 * DIA_EN_LEDGERS;

const DIA: u64 = 86_400;
// La fecha del servicio puede ir hasta 2 días adelante del ledger (husos horarios y margen de la app).
const TOLERANCIA_FECHA: u64 = 2 * DIA;

#[contracttype]
#[derive(Clone)]
enum Clave {
    Admin,
    Taller(Address),
    Expediente(BytesN<32>),
    Ultimo(String),
    // Claves nuevas en v2: los registros anteriores no cambian de formato.
    Anulado(BytesN<32>),
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
        env.storage().persistent().get(&Clave::Taller(taller)).unwrap_or(false)
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

        if !Self::es_aprobado(env.clone(), taller.clone()) {
            return Err(Error::TallerNoAprobado);
        }
        if placa.len() < 3 || placa.len() > 10 {
            return Err(Error::PlacaInvalida);
        }
        let dias = dias_vigencia(&env, &tipo).ok_or(Error::TipoInvalido)?;
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
        let ttl = ttl_para_vigencia(&env, vigente_hasta);
        extender_hasta(&env, &clave_exp, ttl);
        extender_hasta(&env, &Clave::Taller(taller.clone()), ttl);

        // El estado de la unidad lo define el servicio más reciente por fecha
        // (si empatan, el último registrado), igual que en la app.
        let clave_ult = Clave::Ultimo(placa.clone());
        let reemplazar = match env.storage().persistent().get::<_, BytesN<32>>(&clave_ult) {
            None => true,
            Some(anterior) => {
                let previo: Option<Registro> = env.storage().persistent().get(&Clave::Expediente(anterior));
                previo.map_or(true, |p| fecha >= p.fecha)
            }
        };
        if reemplazar {
            env.storage().persistent().set(&clave_ult, &hash);
        }
        extender_hasta(&env, &clave_ult, ttl);
        env.storage().instance().extend_ttl(ttl, ttl);

        ExpedienteRegistrado { placa, hash, taller, vigente_hasta }.publish(&env);
        Ok(())
    }

    /// Mantiene en la red el estado de una placa: extiende el último expediente, el puntero de la placa
    /// y la aprobación de su taller para que no se archiven antes de que venza el servicio.
    /// Cualquiera puede llamarla (quien la llama paga la comisión). Devuelve el TTL aplicado, en ledgers.
    pub fn renovar(env: Env, placa: String) -> Result<u32, Error> {
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
        if motivo.len() < 3 || motivo.len() > 200 {
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

    /// Anulación de un expediente, si la tiene.
    pub fn anulacion(env: Env, hash: BytesN<32>) -> Option<Anulacion> {
        env.storage().persistent().get(&Clave::Anulado(hash))
    }

    /// Expediente por su hash (para comprobar la integridad de cualquier servicio, no solo el último).
    pub fn expediente(env: Env, hash: BytesN<32>) -> Option<Registro> {
        env.storage().persistent().get(&Clave::Expediente(hash))
    }

    /// Estado público de una placa, calculado con la hora del ledger.
    pub fn estado(env: Env, placa: String) -> Option<EstadoUnidad> {
        let hash: BytesN<32> = env.storage().persistent().get(&Clave::Ultimo(placa))?;
        let registro: Registro = env.storage().persistent().get(&Clave::Expediente(hash.clone()))?;
        let vigente = registro.vigente_hasta >= env.ledger().timestamp();
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
