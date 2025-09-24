const fs = require("fs");
const path = require("path");

const plugin = path.join(__dirname, "../../../node_modules/@nomiclabs/hardhat-etherscan/dist/src");

const versionFile = path.join(plugin, "solc/version.js");
const versionSource = fs.readFileSync(versionFile, "utf8");
const oldList = "https://solc-bin.ethereum.org/bin/list.json";
const newList = "https://binaries.soliditylang.org/bin/list.json";
if (!versionSource.includes(oldList) && !versionSource.includes(newList)) {
    throw new Error(`solc list URL not found in ${versionFile}`);
}
fs.writeFileSync(versionFile, versionSource.replace(oldList, newList));

const serviceFile = path.join(plugin, "etherscan/EtherscanService.js");
let service = fs.readFileSync(serviceFile, "utf8");
const preserve = `function withExistingQuery(url, parameters) {
    const next = new URL(url);
    const merged = new URLSearchParams(next.search);
    for (const [key, value] of parameters) merged.set(key, value);
    next.search = merged.toString();
    return next;
}
`;
if (!service.includes("function withExistingQuery")) {
    service = service.replace(
        "async function getVerificationStatus(url, req) {",
        `${preserve}async function getVerificationStatus(url, req) {`
    );
}
service = service.replace(
    `const parameters = new URLSearchParams({ ...req });
    const urlWithQuery = new URL(url);
    urlWithQuery.search = parameters.toString();`,
    `const parameters = new URLSearchParams({ ...req });
    const urlWithQuery = withExistingQuery(url, parameters);`
);
service = service.replace(
    `const url = new URL(apiURL);
    url.search = parameters.toString();`,
    `const url = withExistingQuery(apiURL, parameters);`
);
if (!service.includes("withExistingQuery(url, parameters)") || !service.includes("withExistingQuery(apiURL, parameters)")) {
    throw new Error(`could not keep the Etherscan chainid query in ${serviceFile}`);
}
fs.writeFileSync(serviceFile, service);
