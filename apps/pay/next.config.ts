import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    transpilePackages: ["@opus/sdk"],
    turbopack: {
        resolveAlias: {
            "@opus/sdk": "../../packages/sdk/src/index.ts",
        },
    },
    webpack: (config) => {
        config.resolve.alias["@opus/sdk"] = path.join(__dirname, "../../packages/sdk/src/index.ts");
        return config;
    },
};

export default nextConfig;
