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

#[contracttype]
#[derive(Clone)]
enum Clave {
    Admin,
    Taller(Address),
    Expediente(BytesN<32>),
    Ultimo(String),
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

fn tipo_valido(env: &Env, tipo: &Symbol) -> bool {
    *tipo == Symbol::new(env, "preventivo") || *tipo == Symbol::new(env, "correctivo") || *tipo == Symbol::new(env, "verificacion")
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
        if !tipo_valido(&env, &tipo) {
            return Err(Error::TipoInvalido);
        }
        if vigente_hasta <= fecha {
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
        extender(&env, &clave_exp);

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
        extender(&env, &clave_ult);
        extender_instancia(&env);

        ExpedienteRegistrado { placa, hash, taller, vigente_hasta }.publish(&env);
        Ok(())
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
