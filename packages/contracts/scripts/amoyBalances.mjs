/**
 * Shows whether the Amoy test wallets hold enough POL and USDC for the acceptance runs
 * (docs/runbooks/AMOY_LIVE_ACCEPTANCE.md). Reads balances only; it signs nothing.
 *
 *   yarn balances:amoy
 *   AMOY_URL=https://... yarn balances:amoy
 *
 * POL needs assume the 70 gwei default gas price (about three times the earlier 25 gwei).
 */
const RPC = process.env.AMOY_URL || "https://polygon-amoy-bor-rpc.publicnode.com";
const USDC = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

// [name, address, POL needed, USDC needed, note]
const WALLETS = [
    ["Client", "0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0", 0.45, 8.1, "acceptance 7 USDC + dispute 1.1 USDC"],
    ["Provider", "0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be", 0.1, 0.1, "dispute deposit 0.1 USDC"],
    ["Arbiter", "0x31923881A21A28254b2330cd41084Cafe0a64644", 0.1, 0, "rules the dispute"],
    ["Keeper", "0x87775F236D38526f48F702EE36FD195c75882cBc", 0.3, 0, "deadline calls"],
    ["Relayer", "0x942fa17cf26b6b0CbEA6A11141007501fe064577", 0.5, 0, "pays gas for the gasless run"],
    ["Zero-POL client", "0xF304B61b7889B3B11D9F074e049Ee022AcC8830e", 0, 1, "POL must stay exactly 0"],
    ["Zero-POL provider", "0xA84a2dC2Da35f79fF315F377Ae99b8ac3DcE87a3", 0, 0, "POL must stay exactly 0"],
    ["Deployer", "0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba", 0, 0, "does not sign the runs"],
];

let id = 0;
async function rpc(method, params) {
    const response = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = await response.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
}

const pol = async (address) => Number(BigInt(await rpc("eth_getBalance", [address, "latest"]))) / 1e18;
const usdc = async (address) => {
    const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
    return Number(BigInt(await rpc("eth_call", [{ to: USDC, data }, "latest"]))) / 1e6;
};

const block = await rpc("eth_getBlockByNumber", ["latest", false]);
console.log(`RPC ${RPC}`);
console.log(`Base fee ${(Number(BigInt(block.baseFeePerGas)) / 1e9).toFixed(2)} gwei (send at least base fee + 25)\n`);
let short = 0;
for (const [name, address, needPol, needUsdc, note] of WALLETS) {
    const [p, u] = await Promise.all([pol(address), usdc(address)]);
    const zero = name.startsWith("Zero-POL");
    const polOk = zero ? p === 0 : p >= needPol;
    const usdcOk = u >= needUsdc;
    if (!polOk || !usdcOk) short++;
    const mark = polOk && usdcOk ? "OK " : "LOW";
    console.log(
        `${mark} ${name.padEnd(18)} ${address}  POL ${p.toFixed(4).padStart(9)} (need ${zero ? "0" : needPol})  USDC ${u
            .toFixed(2)
            .padStart(7)} (need ${needUsdc})  ${note}`
    );
}
console.log(
    short === 0
        ? "\nAll wallets are ready."
        : `\n${short} wallet(s) need funds. Faucets: https://faucet.polygon.technology/ (POL), https://faucet.circle.com/ (USDC)`
);
