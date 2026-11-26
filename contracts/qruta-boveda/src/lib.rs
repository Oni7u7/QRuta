//! Bóveda de QRuta (reto exprés "Bóveda" del Ship It, 26 nov 2026).
//!
//! Guarda XLM de testnet y solo los entrega a quien presente el código correcto.
//! El contrato no guarda el código, solo su huella SHA-256: leer el estado no revela cómo abrirla.
//! Se abre una sola vez: quien reclama recibe todo el saldo.
#![no_std]

use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN, Env, String};

#[contracttype]
#[derive(Clone)]
enum Clave {
    Token,
    Huella,
    AbiertaPor,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    CodigoIncorrecto = 1,
    YaAbierta = 2,
    MontoInvalido = 3,
    SinFondos = 4,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposito {
    #[topic]
    pub desde: Address,
    pub monto: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BovedaAbierta {
    #[topic]
    pub destino: Address,
    pub monto: i128,
}

#[contract]
pub struct QrutaBoveda;

fn token(env: &Env) -> token::Client<'_> {
    let id: Address = env.storage().instance().get(&Clave::Token).unwrap();
    token::Client::new(env, &id)
}

fn extender(env: &Env) {
    env.storage().instance().extend_ttl(30 * 17_280, 120 * 17_280);
}

#[contractimpl]
impl QrutaBoveda {
    /// `token`: contrato del activo que guarda (XLM nativo). `huella`: SHA-256 del código.
    pub fn __constructor(env: Env, token: Address, huella: BytesN<32>) {
        env.storage().instance().set(&Clave::Token, &token);
        env.storage().instance().set(&Clave::Huella, &huella);
        extender(&env);
    }

    /// Deposita en la bóveda. Firma quien deposita.
    pub fn depositar(env: Env, desde: Address, monto: i128) -> Result<i128, Error> {
        desde.require_auth();
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        if env.storage().instance().has(&Clave::AbiertaPor) {
            return Err(Error::YaAbierta);
        }
        let t = token(&env);
        t.transfer(&desde, env.current_contract_address(), &monto);
        extender(&env);
        Deposito { desde, monto }.publish(&env);
        Ok(t.balance(&env.current_contract_address()))
    }

    /// Abre la bóveda con el código y envía todo el saldo a `destino`, que debe firmar.
    pub fn reclamar(env: Env, destino: Address, codigo: String) -> Result<i128, Error> {
        destino.require_auth();
        if env.storage().instance().has(&Clave::AbiertaPor) {
            return Err(Error::YaAbierta);
        }
        let huella: BytesN<32> = env.storage().instance().get(&Clave::Huella).unwrap();
        if env.crypto().sha256(&codigo.to_bytes()).to_bytes() != huella {
            return Err(Error::CodigoIncorrecto);
        }
        let t = token(&env);
        let saldo = t.balance(&env.current_contract_address());
        if saldo <= 0 {
            return Err(Error::SinFondos);
        }
        // Se marca antes de transferir: no se puede abrir dos veces.
        env.storage().instance().set(&Clave::AbiertaPor, &destino);
        t.transfer(&env.current_contract_address(), &destino, &saldo);
        extender(&env);
        BovedaAbierta { destino, monto: saldo }.publish(&env);
        Ok(saldo)
    }

    /// Saldo actual (en stroops: 1 XLM = 10,000,000).
    pub fn saldo(env: Env) -> i128 {
        token(&env).balance(&env.current_contract_address())
    }

    /// Quién la abrió, si ya se abrió.
    pub fn abierta_por(env: Env) -> Option<Address> {
        env.storage().instance().get(&Clave::AbiertaPor)
    }
}

#[cfg(test)]
mod test;
