import { expect } from "chai";

import { LOCALES, MESSAGES, localizeError, pickLocale, translate } from "../src/lib/i18n";
import { countdown } from "../src/lib/proof";
import { roleGuide, statusFacts } from "../src/lib/status-text";
import { plainTerms } from "../src/lib/terms";

const slots = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("four languages", () => {
    it("gives every language the same keys and the same {slots}", () => {
        const keys = Object.keys(MESSAGES.en).sort();
        for (const locale of LOCALES) {
            expect(Object.keys(MESSAGES[locale]).sort(), locale).to.deep.equal(keys);
            for (const key of keys) {
                const k = key as keyof typeof MESSAGES.en;
                expect(slots(MESSAGES[locale][k]), `${locale} ${key}`).to.equal(slots(MESSAGES.en[k]));
                expect(MESSAGES[locale][k].trim(), `${locale} ${key}`).to.not.equal("");
            }
        }
    });

    it("picks the first browser language it speaks", () => {
        expect(pickLocale(["ko-KR", "en-US"])).to.equal("ko");
        expect(pickLocale(["fr-FR", "ja"])).to.equal("ja");
        expect(pickLocale(["zh-TW"])).to.equal("zh");
        expect(pickLocale(["de"])).to.equal("en");
    });

    it("fills the slots", () => {
        expect(translate("ko", "open.stepOf", { index: 1, total: 4 })).to.equal("4단계 중 1단계");
        expect(translate("en", "open.sign", { step: "Set the amount" })).to.equal("Sign: Set the amount");
    });

    it("speaks the screens in the chosen language", () => {
        expect(plainTerms(3600, "provider", "ko")).to.equal(
            "결과물 제출 후 1시간 안에 의뢰인이 이의를 제기하지 않으면 자동으로 지급됩니다."
        );
        expect(plainTerms(86400 * 3, "client", "ja")).to.contain("3日");
        expect(countdown(3700n, 0n, "zh")).to.equal("1 小时 1 分");
        expect(roleGuide("provider", "Completed", "Resolved", true, "ko")).to.equal("완료. 지급받았습니다.");
        expect(statusFacts({ status: "Funded", phase: "Funded", nextDeadline: null, now: 0n }, "ja")[0]).to.deep.equal({
            label: "ジョブ",
            value: "預け入れ済み",
        });
    });

    it("translates known link errors and passes others through", () => {
        expect(localizeError("ko", "The link has expired")).to.equal("링크가 만료되었습니다");
        expect(localizeError("ko", "Something else")).to.equal("Something else");
    });
});
