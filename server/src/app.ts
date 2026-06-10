// Сборка Fastify-приложения: bodyLimit, обработчик ошибок, безопасность,
// внутренний API и раздача статики. Вынесено отдельно для переиспользования в тестах.
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AppConfig } from "./config.js";
import type { DB } from "./db.js";
import { getMeta } from "./db.js";
import type { RefreshState } from "./sync.js";
import { registerSecurity } from "./security.js";
import { registerApiRoutes } from "./routes.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface BuildOptions {
  config: AppConfig;
  db: DB;
  refresh: RefreshState;
  logger?: boolean;
  serveStatic?: boolean;
}

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance> {
  const { config, db, refresh } = opts;
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 64 * 1024 });

  // Наружу не утекают стек/детали 5xx; клиентские ошибки сохраняют сообщение.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    req.log.error(err);
    const status = err.statusCode ?? 500;
    if (status >= 500) void reply.code(500).send({ error: "Внутренняя ошибка сервера" });
    else void reply.code(status).send({ error: err.message });
  });

  await registerSecurity(app, config);

  app.get("/api/health", async () => ({
    ok: true,
    db: "connected",
    lastUpdateRooms: getMeta(db, "last_update_rooms"),
    lastUpdateTemplates: getMeta(db, "last_update_templates"),
  }));

  await registerApiRoutes(app, { db, refresh, importantTemplates: config.importantTemplates });

  if (opts.serveStatic !== false) {
    const clientDist = config.staticDir || join(here, "../../client/dist");
    if (existsSync(clientDist)) {
      await app.register(fastifyStatic, { root: clientDist });
      app.setNotFoundHandler((req, reply) => {
        if (req.raw.url?.startsWith("/api/")) {
          void reply.code(404).send({ error: "Not Found" });
          return;
        }
        void reply.sendFile("index.html"); // SPA fallback
      });
    }
  }

  return app;
}
