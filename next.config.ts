import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // stellar-sdk trae dependencias nativas opcionales; se carga desde node_modules en el servidor.
  serverExternalPackages: ["@stellar/stellar-sdk"],
};

export default nextConfig;
