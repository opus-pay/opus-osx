/// <reference path="./node-sqlite.d.ts" />
import { mkdirSync } from "fs";
import path from "path";

import type { Address } from "viem";

import { decodeJson, encodeJson } from "./codec";
import type { Ledger, PageRequest, Paged, Undo } from "./ledger";
import type { InstanceView, JobView } from "./store";

/**
 * The little a SQL ledger needs from a database. Queries use `$1, $2, …` placeholders written in the order they
 * are used (a value used twice is passed twice), which both PostgreSQL and the SQLite adapter accept.
 */
export interface Db {
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    /** Runs `fn` on one connection inside BEGIN/COMMIT, rolling back if it throws. */
    transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
    end(): Promise<void>;
}

export const SCHEMA_VERSION = "1";

export class SchemaVersionError extends Error {}

const DDL = [
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS instances (instance TEXT PRIMARY KEY, data TEXT NOT NULL)",
    `CREATE TABLE IF NOT EXISTS jobs (
        instance TEXT NOT NULL, job_id TEXT NOT NULL, client TEXT NOT NULL, provider TEXT NOT NULL,
        evaluator TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (instance, job_id))`,
    "CREATE INDEX IF NOT EXISTS jobs_client ON jobs (client)",
    "CREATE INDEX IF NOT EXISTS jobs_provider ON jobs (provider)",
    "CREATE INDEX IF NOT EXISTS jobs_active ON jobs (instance, evaluator, status)",
    `CREATE TABLE IF NOT EXISTS undo (
        seq BIGINT PRIMARY KEY, block BIGINT NOT NULL, kind TEXT NOT NULL,
        instance TEXT NOT NULL, job_id TEXT NOT NULL, before TEXT)`,
    "CREATE INDEX IF NOT EXISTS undo_block ON undo (block)",
    "CREATE TABLE IF NOT EXISTS hashes (block BIGINT PRIMARY KEY, hash TEXT NOT NULL)",
];

// Job ids are decimal strings; sorting by length then text puts them in numeric order.
const JOB_ORDER = "ORDER BY instance, length(job_id), job_id";
const ALL: PageRequest = { limit: 1_000_000_000, offset: 0 };

const text = (row: Record<string, unknown>, column: string) => String(row[column]);
const count = (rows: Record<string, unknown>[]) => Number(rows[0]?.n ?? 0);

/** A ledger kept in SQL tables. The same code runs on SQLite (one file) and PostgreSQL (a shared server). */
export class SqlLedger implements Ledger {
    private constructor(private readonly db: Db, private readonly counter: { seq: number } = { seq: 0 }) {}

    /** Creates the tables if needed, and refuses a database made by a newer version. */
    static async open(db: Db): Promise<SqlLedger> {
        for (const statement of DDL) await db.query(statement);
        const found = (await db.query("SELECT value FROM meta WHERE key = $1", ["schema"])).rows[0];
        if (found === undefined)
            await db.query("INSERT INTO meta (key, value) VALUES ($1, $2)", ["schema", SCHEMA_VERSION]);
        else if (Number(found.value) > Number(SCHEMA_VERSION)) {
            throw new SchemaVersionError(`The index database is from a newer version (schema ${text(found, "value")})`);
        }
        const top = (await db.query("SELECT MAX(seq) AS n FROM undo")).rows[0]?.n;
        return new SqlLedger(db, { seq: top === null || top === undefined ? 0 : Number(top) });
    }

    async getJob(instance: Address, jobId: bigint) {
        const rows = (
            await this.db.query("SELECT data FROM jobs WHERE instance = $1 AND job_id = $2", [instance, String(jobId)])
        ).rows;
        return rows[0] === undefined ? undefined : decodeJson<JobView>(text(rows[0], "data"));
    }

    async putJob(job: JobView) {
        await this.db.query(
            `INSERT INTO jobs (instance, job_id, client, provider, evaluator, status, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (instance, job_id) DO UPDATE SET
               client = excluded.client, provider = excluded.provider, evaluator = excluded.evaluator,
               status = excluded.status, data = excluded.data`,
            [job.instance, String(job.jobId), job.client, job.provider, job.evaluator, job.status, encodeJson(job)]
        );
    }

    async deleteJob(instance: Address, jobId: bigint) {
        await this.db.query("DELETE FROM jobs WHERE instance = $1 AND job_id = $2", [instance, String(jobId)]);
    }

    async getInstance(instance: Address) {
        const rows = (await this.db.query("SELECT data FROM instances WHERE instance = $1", [instance])).rows;
        return rows[0] === undefined ? undefined : decodeJson<InstanceView>(text(rows[0], "data"));
    }

    async putInstance(view: InstanceView) {
        await this.db.query(
            `INSERT INTO instances (instance, data) VALUES ($1, $2)
             ON CONFLICT (instance) DO UPDATE SET data = excluded.data`,
            [view.instance, encodeJson(view)]
        );
    }

    async deleteInstance(instance: Address) {
        await this.db.query("DELETE FROM instances WHERE instance = $1", [instance]);
    }

    async instances(page: PageRequest = ALL): Promise<Paged<InstanceView>> {
        const total = count((await this.db.query("SELECT COUNT(*) AS n FROM instances")).rows);
        const rows = (
            await this.db.query("SELECT data FROM instances ORDER BY instance LIMIT $1 OFFSET $2", [
                page.limit,
                page.offset,
            ])
        ).rows;
        return { items: rows.map((row) => decodeJson<InstanceView>(text(row, "data"))), total };
    }

    async jobsFor(account: Address, page: PageRequest = ALL): Promise<Paged<JobView>> {
        const where = "WHERE client = $1 OR provider = $2";
        const total = count((await this.db.query(`SELECT COUNT(*) AS n FROM jobs ${where}`, [account, account])).rows);
        const rows = (
            await this.db.query(`SELECT data FROM jobs ${where} ${JOB_ORDER} LIMIT $3 OFFSET $4`, [
                account,
                account,
                page.limit,
                page.offset,
            ])
        ).rows;
        return { items: rows.map((row) => decodeJson<JobView>(text(row, "data"))), total };
    }

    async activeJobs(instance: Address, evaluator: Address) {
        const rows = (
            await this.db.query(
                `SELECT data FROM jobs WHERE instance = $1 AND evaluator = $2 AND status IN ('Funded', 'Submitted') ${JOB_ORDER}`,
                [instance, evaluator]
            )
        ).rows;
        return rows.map((row) => decodeJson<JobView>(text(row, "data")));
    }

    async jobCount() {
        return count((await this.db.query("SELECT COUNT(*) AS n FROM jobs")).rows);
    }

    async getMeta(key: string) {
        const rows = (await this.db.query("SELECT value FROM meta WHERE key = $1", [key])).rows;
        return rows[0] === undefined ? undefined : text(rows[0], "value");
    }

    async setMeta(key: string, value: string) {
        await this.db.query(
            `INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
            [key, value]
        );
    }

    async addUndo(block: bigint, entry: Undo) {
        this.counter.seq += 1;
        await this.db.query(
            "INSERT INTO undo (seq, block, kind, instance, job_id, before) VALUES ($1, $2, $3, $4, $5, $6)",
            [
                this.counter.seq,
                Number(block),
                entry.kind,
                entry.instance,
                entry.kind === "job" ? String(entry.jobId) : "",
                entry.before === null ? null : encodeJson(entry.before),
            ]
        );
    }

    async undoAfter(block: bigint): Promise<Undo[]> {
        const rows = (
            await this.db.query("SELECT kind, instance, job_id, before FROM undo WHERE block > $1 ORDER BY seq DESC", [
                Number(block),
            ])
        ).rows;
        return rows.map((row): Undo => {
            const before = row.before === null || row.before === undefined ? null : text(row, "before");
            const instance = text(row, "instance") as Address;
            return text(row, "kind") === "job"
                ? {
                      kind: "job",
                      instance,
                      jobId: BigInt(text(row, "job_id")),
                      before: before === null ? null : decodeJson<JobView>(before),
                  }
                : { kind: "instance", instance, before: before === null ? null : decodeJson<InstanceView>(before) };
        });
    }

    async dropUndoAfter(block: bigint) {
        await this.db.query("DELETE FROM undo WHERE block > $1", [Number(block)]);
    }

    async pruneUndo(block: bigint) {
        await this.db.query("DELETE FROM undo WHERE block <= $1", [Number(block)]);
    }

    async putHash(block: bigint, hash: string) {
        await this.db.query(
            "INSERT INTO hashes (block, hash) VALUES ($1, $2) ON CONFLICT (block) DO UPDATE SET hash = excluded.hash",
            [Number(block), hash]
        );
    }

    async hashes() {
        const rows = (await this.db.query("SELECT block, hash FROM hashes ORDER BY block")).rows;
        return rows.map((row) => ({ block: BigInt(text(row, "block")), hash: text(row, "hash") }));
    }

    async dropHashesAfter(block: bigint) {
        await this.db.query("DELETE FROM hashes WHERE block > $1", [Number(block)]);
    }

    async pruneHashes(block: bigint) {
        await this.db.query("DELETE FROM hashes WHERE block <= $1", [Number(block)]);
    }

    async transaction<T>(fn: (ledger: Ledger) => Promise<T>): Promise<T> {
        return this.db.transaction((tx) => fn(new SqlLedger(tx, this.counter)));
    }

    async close() {
        await this.db.end();
    }
}

/** SQLite through Node's built-in `node:sqlite`, as one file (or `:memory:`). */
export async function sqliteDb(file: string): Promise<Db> {
    const { DatabaseSync } = await import("node:sqlite");
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    const raw = new DatabaseSync(file);
    raw.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    // Placeholders become anonymous `?` in order, which is why queries must pass each value once per use.
    const toSqlite = (sql: string) => sql.replace(/\$\d+/g, "?");
    const db: Db = {
        async query(sql, params = []) {
            const statement = raw.prepare(toSqlite(sql));
            const values = params as never[];
            if (/^\s*(SELECT|WITH)/i.test(sql)) return { rows: statement.all(...values) as Record<string, unknown>[] };
            statement.run(...values);
            return { rows: [] };
        },
        async transaction(fn) {
            raw.exec("BEGIN");
            try {
                const result = await fn(db);
                raw.exec("COMMIT");
                return result;
            } catch (error) {
                raw.exec("ROLLBACK");
                throw error;
            }
        },
        async end() {
            raw.close();
        },
    };
    return db;
}

/** PostgreSQL through `pg`, loaded only when a database URL is set. */
export async function postgresDb(connectionString: string): Promise<Db> {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString, max: 5 });
    const wrap = (
        run: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
    ): Db["query"] => run;
    const db: Db = {
        query: wrap((sql, params) => pool.query(sql, params as never[])),
        async transaction(fn) {
            const client = await pool.connect();
            const inner: Db = {
                query: wrap((sql, params) => client.query(sql, params as never[])),
                transaction: (nested) => nested(inner),
                end: async () => undefined,
            };
            try {
                await client.query("BEGIN");
                const result = await fn(inner);
                await client.query("COMMIT");
                return result;
            } catch (error) {
                await client.query("ROLLBACK").catch(() => undefined);
                throw error;
            } finally {
                client.release();
            }
        },
        async end() {
            await pool.end();
        },
    };
    return db;
}
