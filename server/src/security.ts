// Безопасность: security-заголовки (helmet), rate-limit, cookie-сессия и
// парольный гейт интерфейса. CORS НЕ включаем — кросс-доменные запросы закрыты.
import type { FastifyInstance, FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "./config.js";

const SESSION_COOKIE = "perco_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 часов

const loginSchema = z.object({ password: z.string() });

/** Сравнение паролей за постоянное время (через sha256, чтобы длины совпадали). */
function sameSecret(a: string, b: string): boolean {
    const ha = createHash("sha256").update(a).digest();
    const hb = createHash("sha256").update(b).digest();
    return timingSafeEqual(ha, hb);
}

export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // React-инлайн-стили
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'self'"],
                // Приложение отдаётся по обычному HTTP в локальной сети — НЕ апгрейдим
                // подресурсы на https (иначе JS/CSS не загрузятся → белая страница).
                upgradeInsecureRequests: null,
            },
        },
    });

    await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
    await app.register(cookie, { secret: config.cookieSecret });

    const authRequired = config.appPassword.length > 0;

    // Серверный набор валидных сессий: cookie несёт случайный id, а не константу,
    // поэтому logout реально инвалидирует сессию, а перехваченный токен можно отозвать.
    // Хранилище в памяти процесса (один инстанс); при рестарте все сессии сбрасываются.
    const sessions = new Set<string>();

    const sessionId = (req: FastifyRequest): string | null => {
        const raw = req.cookies[SESSION_COOKIE];
        if (!raw) return null;
        const un = app.unsignCookie(raw);
        return un.valid && un.value ? un.value : null;
    };

    const isAuthed = (req: FastifyRequest): boolean => {
        if (!authRequired) return true;
        const sid = sessionId(req);
        return sid !== null && sessions.has(sid);
    };

    // Гейт: защищаем /api/* (кроме auth и health). Статический шелл публичен —
    // данные он всё равно не получит без авторизации.
    //
    // ВАЖНО: решение принимаем по СОПОСТАВЛЕННОМУ маршруту (req.routeOptions.url),
    // а НЕ по сырому req.url. Иначе URL-кодирование обходит проверку: роутер
    // декодирует «/%61pi/state/matrix» → «/api/state/matrix», а строковая проверка
    // сырого пути этого не видит. Поэтому хук — preHandler (после маршрутизации).
    app.addHook("preHandler", async (req, reply) => {
        if (!authRequired) return;
        const route = req.routeOptions?.url ?? ""; // зарегистрированный шаблон маршрута
        if (!route.startsWith("/api/")) return; // статика / не-API
        if (route.startsWith("/api/auth/")) return; // вход/выход/статус
        if (route === "/api/health") return;
        if (isAuthed(req)) return;
        await reply.code(401).send({ error: "Не авторизовано" });
    });

    app.get("/api/auth/status", async (req) => ({
        required: authRequired,
        authenticated: isAuthed(req),
    }));

    app.post(
        "/api/auth/login",
        { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
        async (req, reply) => {
            const parsed = loginSchema.safeParse(req.body);
            if (!parsed.success) return reply.code(400).send({ error: "Некорректный запрос" });
            if (!authRequired) return { ok: true };
            if (!sameSecret(parsed.data.password, config.appPassword)) {
                return reply.code(401).send({ error: "Неверный пароль" });
            }
            const sid = randomBytes(18).toString("hex");
            sessions.add(sid);
            reply.setCookie(SESSION_COOKIE, sid, {
                signed: true,
                httpOnly: true,
                sameSite: "strict",
                path: "/",
                maxAge: SESSION_MAX_AGE,
            });
            return { ok: true };
        },
    );

    app.post("/api/auth/logout", async (req, reply) => {
        const sid = sessionId(req);
        if (sid) sessions.delete(sid); // реальная инвалидация на сервере
        reply.clearCookie(SESSION_COOKIE, { path: "/" });
        return { ok: true };
    });
}
