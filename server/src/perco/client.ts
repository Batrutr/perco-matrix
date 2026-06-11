// HTTP-клиент PERCo: авторизация Bearer-токеном и ленивый релогин по 401.
// Токен живёт в памяти процесса; протух (idle) → 401 → один автоматический релогин.
import {
    Agent,
    fetch as undiciFetch,
    type RequestInit as UndiciRequestInit,
    type Response as UndiciResponse,
} from "undici";
import { z, type ZodTypeAny } from "zod";
import { withRetry } from "../util/retry.js";
import {
    authResponseSchema,
    roomsTreeSchema,
    templateListSchema,
    templateDetailSchema,
    type RoomNode,
    type TemplateListItem,
    type TemplateDetail,
} from "./schemas.js";

export interface PercoClientOptions {
    host: string;
    login: string;
    password: string;
    /** Таймаут одного запроса, мс */
    timeoutMs?: number;
    /** Проверять TLS-сертификат PERCo (по умолчанию да) */
    tlsRejectUnauthorized?: boolean;
}

export class PercoError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        /** Транзиентная ли ошибка (сеть/таймаут/5xx) — можно повторить */
        readonly retryable = false,
    ) {
        super(message);
        this.name = "PercoError";
    }
}

/**
 * Разворачивает обёртку undici «fetch failed» до реальной причины из err.cause
 * (код вроде ENOTFOUND/ECONNREFUSED или ошибка TLS-сертификата) — иначе наружу
 * уходит бесполезное «fetch failed».
 */
function describeFetchError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    const cause: unknown = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) {
        const code = (cause as { code?: unknown }).code;
        return code ? `${err.message}: ${cause.message} (${String(code)})` : `${err.message}: ${cause.message}`;
    }
    if (cause && typeof cause === "object" && "code" in cause) {
        return `${err.message}: ${String((cause as { code: unknown }).code)}`;
    }
    return err.message;
}

export class PercoClient {
    private token: string | null = null;
    /** Один общий промис логина, чтобы параллельные запросы не логинились наперегонки */
    private loginInFlight: Promise<string> | null = null;
    private readonly timeoutMs: number;
    /** undici-диспетчер с настройкой проверки TLS (только для self-signed) */
    private readonly dispatcher: Agent | undefined;

    constructor(private readonly opts: PercoClientOptions) {
        this.timeoutMs = opts.timeoutMs ?? 30_000;
        this.dispatcher =
            opts.tlsRejectUnauthorized === false
                ? new Agent({ connect: { rejectUnauthorized: false } })
                : undefined;
    }

    /** Авторизация. force=true сбрасывает текущий токен (релогин). */
    async login(force = false): Promise<string> {
        if (this.token && !force) return this.token;
        if (this.loginInFlight) return this.loginInFlight;

        this.loginInFlight = (async () => {
            const res = await this.rawFetch("/api/system/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login: this.opts.login, password: this.opts.password }),
            });
            if (!res.ok) {
                throw new PercoError(`Авторизация не удалась (HTTP ${res.status})`, res.status);
            }
            const { token } = authResponseSchema.parse(await res.json());
            this.token = token;
            return token;
        })();

        try {
            return await this.loginInFlight;
        } finally {
            this.loginInFlight = null;
        }
    }

    /**
     * GET с валидацией ответа, одним релогином по 401 и ретраем транзиентных ошибок
     * (сеть, таймаут, 5xx). 4xx и ошибки валидации не повторяются.
     */
    private getJson<S extends ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
        return withRetry(() => this.requestOnce(path, schema), {
            retries: 2,
            baseDelayMs: 300,
            isRetryable: (err) => err instanceof PercoError && err.retryable,
        });
    }

    private async requestOnce<S extends ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
        let res = await this.authedFetch(path);
        if (res.status === 401) {
            await this.login(true);
            res = await this.authedFetch(path);
        }
        if (!res.ok) {
            throw new PercoError(
                `Запрос ${path} вернул HTTP ${res.status}`,
                res.status,
                res.status >= 500, // 5xx — транзиентно, 4xx — нет
            );
        }
        return schema.parse(await res.json());
    }

    private async authedFetch(path: string): Promise<UndiciResponse> {
        const token = await this.login();
        return this.rawFetch(path, {
            headers: { Authorization: `Bearer ${token}` },
        });
    }

    private async rawFetch(path: string, init: UndiciRequestInit): Promise<UndiciResponse> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            // Используем fetch из пакета undici (тот же диспетчер, что и Agent),
            // чтобы политика TLS применялась согласованно.
            return await undiciFetch(`${this.opts.host}${path}`, {
                ...init,
                signal: controller.signal,
                dispatcher: this.dispatcher,
            });
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                throw new PercoError(`Таймаут запроса ${path}`, undefined, true);
            }
            throw new PercoError(
                `Сетевая ошибка при запросе ${path}: ${describeFetchError(err)}`,
                undefined,
                true,
            );
        } finally {
            clearTimeout(timer);
        }
    }

    // --- Методы API ---

    getRoomsTree(): Promise<RoomNode[]> {
        return this.getJson("/api/rooms/tree", roomsTreeSchema);
    }

    getTemplateList(): Promise<TemplateListItem[]> {
        return this.getJson("/api/accessTemplates/list", templateListSchema);
    }

    getTemplateDetail(id: number): Promise<TemplateDetail> {
        return this.getJson(`/api/accessTemplates/${id}`, templateDetailSchema);
    }
}
