import "@nomiclabs/hardhat-ethers";

async function main() {
    throw new Error("Polygon mainnet deploy waits for the audit (M8). Use Amoy.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
