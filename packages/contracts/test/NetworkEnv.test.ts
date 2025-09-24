import { expect } from "chai";

import { assertLiveDeployEnv, assertNetworkEnvFile, resolveNetworkEnvFile } from "../src/utils/NetworkEnv";

describe("NetworkEnv", () => {
    it("maps ENV_NETWORK to env/.<network>.env", () => {
        expect(resolveNetworkEnvFile("")).to.equal("env/.env");
        expect(resolveNetworkEnvFile("amoy")).to.equal("env/.amoy.env");
        expect(resolveNetworkEnvFile("polygon")).to.equal("env/.polygon.env");
    });

    it("allows an unset ENV_NETWORK even when env/.env is missing", () => {
        expect(assertNetworkEnvFile("", () => false)).to.equal("env/.env");
    });

    it("rejects a named ENV_NETWORK when its env file is missing", () => {
        expect(() => assertNetworkEnvFile("amoy", () => false)).to.throw(
            "ENV_NETWORK=amoy requires env/.amoy.env. Copy env/.amoy.env.sample to env/.amoy.env."
        );
    });

    it("requires ENV_NETWORK to match the live deploy network", () => {
        const previous = process.env.ENV_NETWORK;
        delete process.env.ENV_NETWORK;
        expect(() => assertLiveDeployEnv("polygon")).to.throw("requires ENV_NETWORK=polygon");
        if (previous === undefined) delete process.env.ENV_NETWORK;
        else process.env.ENV_NETWORK = previous;
    });
});
