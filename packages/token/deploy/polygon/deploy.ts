import "@nomiclabs/hardhat-ethers";

import { deployOpusToken } from "../../src/deployOpusToken";

async function main() {
    await deployOpusToken("polygon");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
