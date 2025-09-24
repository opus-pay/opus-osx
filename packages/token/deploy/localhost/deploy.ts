import "@nomiclabs/hardhat-ethers";

import { deployOpusToken } from "../../src/deployOpusToken";

async function main() {
    await deployOpusToken("localhost");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
