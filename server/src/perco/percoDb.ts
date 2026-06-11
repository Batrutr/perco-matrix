// Прямое (только на чтение) подключение к БД PERCo (MariaDB) для счётчика
// сотрудников на шаблон. Опционально: включается, если задан PERCO_DB_HOST.
import mysql from "mysql2/promise";
import type { PercoDbConfig } from "../config.js";

export class PercoDb {
    private readonly pool: mysql.Pool;

    constructor(cfg: PercoDbConfig) {
        this.pool = mysql.createPool({
            host: cfg.host,
            port: cfg.port,
            database: cfg.database,
            user: cfg.user,
            password: cfg.password,
            connectionLimit: 3,
            connectTimeout: 10_000,
        });
    }

    /** Число сотрудников на каждый шаблон: access_template_id → count. */
    async getEmployeeCounts(): Promise<Map<number, number>> {
        const [rows] = await this.pool.query(
            `SELECT access_template_id AS id, COUNT(*) AS cnt
       FROM user_access_template
       GROUP BY access_template_id`,
        );
        const map = new Map<number, number>();
        for (const row of rows as Array<{ id: number | string; cnt: number | string }>) {
            map.set(Number(row.id), Number(row.cnt));
        }
        return map;
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}
