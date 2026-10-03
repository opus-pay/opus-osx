import { loadAddresses } from "@opus/sdk";
import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { polygonAmoy } from "wagmi/chains";

import addressesJson from "../../../../packages/contracts/deploy/amoy/addresses.json";

export const addresses = loadAddresses(JSON.stringify(addressesJson));

// Public Amoy endpoints fail now and then ("Temporary internal error"). Try each in turn,
// with retries, so one bad response does not stop a payment step.
const AMOY_RPCS = [
    process.env.NEXT_PUBLIC_RPC_URL,
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://rpc-amoy.polygon.technology",
    "https://polygon-amoy.drpc.org",
].filter((url): url is string => url !== undefined && url !== "");

export const wagmiConfig = createConfig({
    chains: [polygonAmoy],
    connectors: [injected()],
    transports: {
        [polygonAmoy.id]: fallback(AMOY_RPCS.map((url) => http(url, { retryCount: 2, retryDelay: 400 }))),
    },
});
