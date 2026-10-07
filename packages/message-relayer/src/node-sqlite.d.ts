// `node:sqlite` is built into Node 22.5+. The Node 20 typings this package builds with do not describe it, so the
// little that is used is declared here.
declare module "node:sqlite" {
    export class StatementSync {
        all(...params: unknown[]): unknown[];
        run(...params: unknown[]): unknown;
    }
    export class DatabaseSync {
        constructor(file: string);
        exec(sql: string): void;
        prepare(sql: string): StatementSync;
        close(): void;
    }
}
