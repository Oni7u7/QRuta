import { afterEach, describe, expect, it, vi } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { configRed, parseRed, sorobanRpcUrl, stellarExpertContractUrl, stellarExpertTxUrl } from "@/lib/config";

describe("parseRed", () => {
  it("usa testnet cuando la variable está vacía", () => {
    expect(parseRed(undefined)).toBe("testnet");
    expect(parseRed("")).toBe("testnet");
  });

  it("acepta testnet y mainnet sin importar mayúsculas o espacios", () => {
    expect(parseRed(" MAINNET ")).toBe("mainnet");
    expect(parseRed("Testnet")).toBe("testnet");
  });

  it("rechaza cualquier otra red", () => {
    expect(() => parseRed("futurenet")).toThrow();
    expect(() => parseRed("public")).toThrow();
  });
});

describe("configRed", () => {
  it("usa la passphrase oficial de cada red", () => {
    expect(configRed("testnet").passphrase).toBe(Networks.TESTNET);
    expect(configRed("mainnet").passphrase).toBe(Networks.PUBLIC);
  });

  it("solo testnet tiene Friendbot", () => {
    expect(configRed("testnet").friendbot).toBe(true);
    expect(configRed("mainnet").friendbot).toBe(false);
  });

  it("arma los enlaces de Stellar Expert de cada red", () => {
    expect(stellarExpertTxUrl("abc", "testnet")).toBe("https://stellar.expert/explorer/testnet/tx/abc");
    expect(stellarExpertTxUrl("abc", "mainnet")).toBe("https://stellar.expert/explorer/public/tx/abc");
    expect(stellarExpertContractUrl("CXYZ", "mainnet")).toBe("https://stellar.expert/explorer/public/contract/CXYZ");
  });
});

describe("sorobanRpcUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("en testnet usa el RPC público de SDF", () => {
    vi.stubEnv("STELLAR_RPC_URL", "");
    expect(sorobanRpcUrl("testnet")).toBe("https://soroban-testnet.stellar.org");
  });

  it("en mainnet exige STELLAR_RPC_URL", () => {
    vi.stubEnv("STELLAR_RPC_URL", "");
    expect(() => sorobanRpcUrl("mainnet")).toThrow(/STELLAR_RPC_URL/);
    vi.stubEnv("STELLAR_RPC_URL", "https://rpc.ejemplo.com");
    expect(sorobanRpcUrl("mainnet")).toBe("https://rpc.ejemplo.com");
  });
});
