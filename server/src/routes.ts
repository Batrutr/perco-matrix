// Внутренний API: чтение кэша (/api/state/*) и запуск обновления (/api/refresh/*).
import type { FastifyInstance } from "fastify";
import type { MatrixResponse, RefreshKind } from "@perco/shared";
import type { DB } from "./db.js";
import type { RefreshState } from "./sync.js";
import { getRooms, getTemplates, getCells, getStateMeta } from "./repo.js";

const REFRESH_KINDS: readonly RefreshKind[] = ["rooms", "templates", "all", "employees"];

function isRefreshKind(value: string): value is RefreshKind {
  return (REFRESH_KINDS as readonly string[]).includes(value);
}

export interface ApiDeps {
  db: DB;
  refresh: RefreshState;
}

export async function registerApiRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { db, refresh } = deps;

  // --- Чтение кэша ---

  app.get("/api/state/rooms", async () => getRooms(db));

  app.get("/api/state/templates", async () => getTemplates(db));

  app.get("/api/state/meta", async () => getStateMeta(db));

  app.get("/api/state/matrix", async (): Promise<MatrixResponse> => ({
    rooms: getRooms(db),
    templates: getTemplates(db),
    cells: getCells(db),
    meta: getStateMeta(db),
  }));

  // --- Обновление ---

  app.post<{ Params: { kind: string } }>(
    "/api/refresh/:kind",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { kind } = req.params;
      if (!isRefreshKind(kind)) {
        return reply.code(400).send({ error: `Неизвестный тип обновления: ${kind}` });
      }
      const started = refresh.start(kind);
      if (!started) {
        // 409: уже идёт другое обновление
        return reply.code(409).send({ started: false, status: refresh.getStatus() });
      }
      return reply.send({ started: true, status: refresh.getStatus() });
    },
  );

  app.get("/api/refresh/status", async () => refresh.getStatus());
}
