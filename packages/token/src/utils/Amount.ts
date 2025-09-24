import { BigNumber } from "ethers";

/**
 * 소수점 자리수를 함께 들고 다니는 금액 표현.
 *
 * OPUS는 18자리인 OPG와 6자리인 USDT/USDC를 동시에 다루므로, 두 자산의 수량을
 * 같은 정수 타입으로만 주고받으면 자리수 혼동이 조용히 금액 오류로 이어집니다.
 */
export class Amount {
    private readonly _value: BigNumber;
    private readonly _decimal: number;

    constructor(value: BigNumber, decimal: number = 18) {
        if (decimal < 0) throw new Error("Invalid decimal");
        this._value = BigNumber.from(value);
        this._decimal = decimal;
    }

    public get value(): BigNumber {
        return this._value;
    }

    public get decimal(): number {
        return this._decimal;
    }

    /**
     * 사람이 읽는 표기("1.5", 1000)를 소수점을 반영한 정수 수량으로 변환합니다.
     */
    public static make(display: string | number, decimal: number = 18): Amount {
        if (decimal < 0) throw new Error("Invalid decimal");
        const amount = display.toString();
        if (amount === "") return new Amount(BigNumber.from("0"), decimal);

        const zeros = "0".repeat(decimal);
        const numbers = amount.replace(/[,_]/gi, "").split(".");
        if (numbers.length === 1) return new Amount(BigNumber.from(numbers[0] + zeros), decimal);

        let fraction = numbers[1];
        if (fraction.length > decimal) fraction = fraction.slice(0, decimal);
        else fraction = fraction.padEnd(decimal, "0");

        const integral = BigNumber.from(numbers[0] + zeros);
        return new Amount(integral.add(BigNumber.from(fraction)), decimal);
    }

    /**
     * 자리수를 변환합니다. 자리수를 줄이는 방향은 내림이므로 정산 경로에서는 쓰지 마십시오.
     */
    public convert(decimal: number): Amount {
        if (decimal < 0) throw new Error("Invalid decimal");
        if (decimal > this._decimal) {
            return new Amount(this._value.mul(BigNumber.from(10).pow(decimal - this._decimal)), decimal);
        }
        if (decimal < this._decimal) {
            return new Amount(this._value.div(BigNumber.from(10).pow(this._decimal - decimal)), decimal);
        }
        return new Amount(this._value, decimal);
    }

    public toString(): string {
        return this._value.toString();
    }

    /**
     * 소수점 표기로 출력합니다. 자리수는 모두 채워 출력합니다.
     */
    public toAmountString(): string {
        const factor = BigNumber.from(10).pow(this._decimal);
        const integral = this._value.div(factor);
        const fraction = this._value.sub(integral.mul(factor));
        return `${integral.toString()}.${fraction.toString().padStart(this._decimal, "0")}`;
    }

    public toDisplayString(comma: boolean = false, precision: number = 0): string {
        const factor = BigNumber.from(10).pow(this._decimal);
        const share = this._value.div(factor);
        const remain = this._value.sub(share.mul(factor));
        const shareText = comma
            ? share.toNumber().toLocaleString("en-US", { maximumFractionDigits: 7 })
            : share.toString();

        if (remain.eq(BigNumber.from(0))) return shareText;

        let remainText = remain.toString().padStart(this._decimal, "0").substring(0, precision);
        remainText = remainText.replace(/0+$/g, "");
        return remainText.length > 0 ? `${shareText}.${remainText}` : shareText;
    }
}

/** 거버넌스 토큰 OPG. */
export class OpgAmount {
    public static DECIMAL = 18;

    public static make(display: string | number): Amount {
        return Amount.make(display, OpgAmount.DECIMAL);
    }

    public static from(value: BigNumber): Amount {
        return new Amount(value, OpgAmount.DECIMAL);
    }
}

/** USDT·USDC 등 6자리 스테이블코인. */
export class StableAmount {
    public static DECIMAL = 6;

    public static make(display: string | number): Amount {
        return Amount.make(display, StableAmount.DECIMAL);
    }

    public static from(value: BigNumber): Amount {
        return new Amount(value, StableAmount.DECIMAL);
    }
}
