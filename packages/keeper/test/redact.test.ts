import { expect } from "chai";

import { redactUrls, rpcHost } from "../src/redact";

describe("keeping provider keys out of logs", () => {
    it("cuts addresses down to their host", () => {
        const text =
            "HTTP request failed.\n\nURL: https://polygon-amoy.g.alchemy.com/v2/SECRETKEY123?token=abc\nDetails: boom";
        const out = redactUrls(text);
        expect(out).to.not.contain("SECRETKEY123").and.not.contain("token=abc");
        expect(out).to.contain("https://polygon-amoy.g.alchemy.com/…").and.to.contain("Details: boom");
    });

    it("shows only the host of the provider at start", () => {
        expect(rpcHost("https://rpc.example.com/v2/SECRETKEY123")).to.equal("rpc.example.com");
        expect(rpcHost("not a url")).to.equal("[invalid url]");
    });
});
