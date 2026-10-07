/// <reference path="./node-sqlite.d.ts" />
import { mkdirSync } from "fs";
import path from "path";

/** A phone registered by a wallet. `address` is lower case. */
export type Device = { address: string; token: string; lang: string; platform: string; registeredAt: number };

export type Ticket = { id: string; token: string; at: number };

/** At most this many phones per wallet; registering another removes the oldest. */
export const MAX_DEVICES_PER_ADDRESS = 5;

/**
 * The address-to-device table, a mute list and the tickets waiting for a receipt, in SQLite through Node's built-in
 * `node:sqlite` (one file, or `:memory:`). One process owns the file.
 */
export class Store {
    private constructor(private readonly db: import("node:sqlite").DatabaseSync) {}

    static async open(file: string): Promise<Store> {
        const { DatabaseSync } = await import("node:sqlite");
        if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
        const db = new DatabaseSync(file);
        db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS devices (
                address TEXT NOT NULL, token TEXT NOT NULL, lang TEXT NOT NULL, platform TEXT NOT NULL,
                registered_at INTEGER NOT NULL, PRIMARY KEY (address, token));
            CREATE INDEX IF NOT EXISTS devices_token ON devices (token);
            CREATE TABLE IF NOT EXISTS mutes (address TEXT NOT NULL, app TEXT NOT NULL, PRIMARY KEY (address, app));
            CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, token TEXT NOT NULL, at INTEGER NOT NULL);`);
        return new Store(db);
    }

    /** Adds or refreshes a device. A token belongs to one wallet: registering it for another wallet moves it. */
    register(device: Device): void {
        this.db.prepare("DELETE FROM devices WHERE token = ? AND address <> ?").run(device.token, device.address);
        this.db
            .prepare(
                `INSERT INTO devices (address, token, lang, platform, registered_at) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (address, token) DO UPDATE SET lang = excluded.lang, platform = excluded.platform, registered_at = excluded.registered_at`
            )
            .run(device.address, device.token, device.lang, device.platform, device.registeredAt);
        const rows = this.db
            .prepare("SELECT token FROM devices WHERE address = ? ORDER BY registered_at DESC, rowid DESC")
            .all(device.address) as { token: string }[];
        for (const row of rows.slice(MAX_DEVICES_PER_ADDRESS)) {
            this.db.prepare("DELETE FROM devices WHERE address = ? AND token = ?").run(device.address, row.token);
        }
    }

    unregister(address: string, token: string): void {
        this.db.prepare("DELETE FROM devices WHERE address = ? AND token = ?").run(address, token);
    }

    /** Removes a token for every wallet (the push service said the phone is gone). */
    forget(token: string): void {
        this.db.prepare("DELETE FROM devices WHERE token = ?").run(token);
    }

    devicesOf(address: string): Device[] {
        const rows = this.db
            .prepare(
                "SELECT address, token, lang, platform, registered_at AS registeredAt FROM devices WHERE address = ?"
            )
            .all(address) as Device[];
        return rows;
    }

    deviceCount(): number {
        return Number((this.db.prepare("SELECT COUNT(*) AS n FROM devices").all()[0] as { n: number | bigint }).n);
    }

    setMute(address: string, app: string, muted: boolean): void {
        if (muted) this.db.prepare("INSERT OR IGNORE INTO mutes (address, app) VALUES (?, ?)").run(address, app);
        else this.db.prepare("DELETE FROM mutes WHERE address = ? AND app = ?").run(address, app);
    }

    isMuted(address: string, app: string): boolean {
        return this.db.prepare("SELECT 1 AS x FROM mutes WHERE address = ? AND app = ?").all(address, app).length > 0;
    }

    addTickets(tickets: readonly Ticket[]): void {
        for (const t of tickets) {
            this.db.prepare("INSERT OR REPLACE INTO tickets (id, token, at) VALUES (?, ?, ?)").run(t.id, t.token, t.at);
        }
    }

    /** Tickets old enough to have a receipt (`before`) and young enough to keep (`after`). */
    ticketsBetween(after: number, before: number, limit = 1000): Ticket[] {
        return this.db
            .prepare("SELECT id, token, at FROM tickets WHERE at > ? AND at <= ? ORDER BY at LIMIT ?")
            .all(after, before, limit) as Ticket[];
    }

    removeTickets(ids: readonly string[]): void {
        for (const id of ids) this.db.prepare("DELETE FROM tickets WHERE id = ?").run(id);
    }

    /** Drops tickets older than `before` that never got a receipt answer. */
    expireTickets(before: number): void {
        this.db.prepare("DELETE FROM tickets WHERE at <= ?").run(before);
    }

    close(): void {
        this.db.close();
    }
}
