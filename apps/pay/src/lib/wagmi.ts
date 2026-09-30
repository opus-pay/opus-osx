import { loadAddresses } from "@opus/sdk";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { polygonAmoy } from "wagmi/chains";

import addressesJson from "../../../../packages/contracts/deploy/amoy/addresses.json";

export const addresses = loadAddresses(JSON.stringify(addressesJson));

export const wagmiConfig = createConfig({
    chains: [polygonAmoy],
    connectors: [injected()],
    transports: {
        [polygonAmoy.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
    },
});
