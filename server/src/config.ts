// Конфигурация сервера из переменных окружения.
// Секреты (host/login/pass PERCo) задаются здесь и не уходят в браузер.
import { createHash, randomBytes } from "node:crypto";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Не задана обязательная переменная окружения: ${name}`);
  }
  return v;
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !/^(0|false|no)$/i.test(value.trim());
}

/** Секрет cookie: детерминированный из пароля (сессии переживают рестарт) или случайный. */
function deriveCookieSecret(appPassword: string): string {
  if (process.env.APP_COOKIE_SECRET) return process.env.APP_COOKIE_SECRET;
  if (appPassword) return createHash("sha256").update(`perco:${appPassword}`).digest("hex");
  return randomBytes(32).toString("hex");
}

export interface PercoDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface AppConfig {
  perco: {
    host: string;
    login: string;
    password: string;
    concurrency: number;
    /** Проверять TLS-сертификат PERCo. false — только для self-signed в доверенной сети. */
    tlsRejectUnauthorized: boolean;
  };
  /** Прямое подключение к БД PERCo (MariaDB) для счётчика сотрудников; null = выключено */
  percoDb: PercoDbConfig | null;
  server: {
    host: string;
    port: number;
  };
  dbPath: string;
  /** Пароль на веб-интерфейс; пусто = без защиты */
  appPassword: string;
  /** Секрет для подписи cookie сессии */
  cookieSecret: string;
  /** Путь к собранной статике клиента; пусто = относительный путь рядом с сервером */
  staticDir: string;
  /** «Важные» шаблоны для закрепления одной кнопкой — по id или по имени */
  importantTemplates: string[];
}

export function loadConfig(): AppConfig {
  const appPassword = process.env.APP_PASSWORD ?? "";
  return {
    perco: {
      host: normalizeHost(required("PERCO_HOST", "https://perco.example.local")),
      login: required("PERCO_LOGIN", "admin"),
      password: required("PERCO_PASSWORD", "changeme"),
      concurrency: Number(process.env.PERCO_CONCURRENCY ?? "8"),
      tlsRejectUnauthorized: bool(process.env.PERCO_TLS_REJECT_UNAUTHORIZED, true),
    },
    percoDb: process.env.PERCO_DB_HOST
      ? {
          host: process.env.PERCO_DB_HOST,
          port: Number(process.env.PERCO_DB_PORT ?? "3306"),
          database: required("PERCO_DB_NAME"),
          user: required("PERCO_DB_USER"),
          password: process.env.PERCO_DB_PASSWORD ?? "",
        }
      : null,
    server: {
      host: process.env.HOST ?? "0.0.0.0",
      port: Number(process.env.PORT ?? "3000"),
    },
    dbPath: process.env.DB_PATH ?? "./data/perco.sqlite",
    appPassword,
    cookieSecret: deriveCookieSecret(appPassword),
    staticDir: process.env.STATIC_DIR ?? "",
    importantTemplates: (process.env.PINNED_TEMPLATES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}
