import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El SDK de Anthropic sólo corre en el servidor; que Next no intente empaquetarlo.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
