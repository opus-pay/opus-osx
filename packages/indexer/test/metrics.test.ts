import { expect } from "chai";

import { coins, renderMetrics } from "../src/metrics";

describe("metrics text", () => {
    it("groups samples under one HELP and TYPE and writes labels", () => {
        const text = renderMetrics([
            { name: "x_jobs", help: "Jobs.", type: "gauge", value: 2, labels: { status: "Funded" } },
            { name: "x_jobs", help: "Jobs.", type: "gauge", value: 1, labels: { status: "Open" } },
            { name: "x_up", help: "Up.", type: "gauge", value: 1 },
        ]);
        expect(text).to.equal(
            [
                "# HELP x_jobs Jobs.",
                "# TYPE x_jobs gauge",
                'x_jobs{status="Funded"} 2',
                'x_jobs{status="Open"} 1',
                "# HELP x_up Up.",
                "# TYPE x_up gauge",
                "x_up 1",
                "",
            ].join("\n")
        );
    });

    it("escapes label values and help text", () => {
        const text = renderMetrics([
            { name: "x_total", help: "a\\b\nc", type: "counter", value: 3, labels: { why: 'say "hi"\n' } },
        ]);
        expect(text).to.contain("# HELP x_total a\\\\b\\nc");
        expect(text).to.contain('x_total{why="say \\"hi\\"\\n"} 3');
    });

    it("writes bigint, NaN and infinity values and refuses bad names", () => {
        const text = renderMetrics([
            { name: "x_a", help: "a", type: "gauge", value: 5n },
            { name: "x_b", help: "b", type: "gauge", value: NaN },
            { name: "x_c", help: "c", type: "gauge", value: Infinity },
        ]);
        expect(text).to.contain("x_a 5").and.to.contain("x_b NaN").and.to.contain("x_c +Inf");
        expect(() => renderMetrics([{ name: "9bad", help: "", type: "gauge", value: 1 }])).to.throw("invalid metric");
        expect(() =>
            renderMetrics([{ name: "x", help: "", type: "gauge", value: 1, labels: { "bad-label": "1" } }])
        ).to.throw("invalid label");
    });

    it("turns wei into coins", () => {
        expect(coins(1_500_000_000_000_000_000n)).to.equal(1.5);
    });
});
