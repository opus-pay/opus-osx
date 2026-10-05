// Big numbers go through JSON as "123n" strings. No address, hash or name in the ledger looks like that.
const BIG = /^\d+n$/;

export const encodeJson = (value: unknown): string =>
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? `${item}n` : item));

export const decodeJson = <T>(text: string): T =>
    JSON.parse(text, (_key, item) =>
        typeof item === "string" && BIG.test(item) ? BigInt(item.slice(0, -1)) : item
    ) as T;
