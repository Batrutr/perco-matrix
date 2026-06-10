// Тесты Этапа 2: внутренний API через fastify.inject (без сети).
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { MatrixResponse, RefreshStatus } from "@perco/shared";
import { openDb } from "./db.js";
import { roomsTreeSchema, templateListSchema, templateDetailSchema } from "./perco/schemas.js";
import { replaceRooms, replaceTemplates, saveTemplateAccess } from "./repo.js";
import { RefreshState } from "./sync.js";
import { registerApiRoutes } from "./routes.js";
import type { PercoClient } from "./perco/client.js";
import type { DB } from "./db.js";

const TREE = [
  {
    id: 1,
    is_const: 1,
    name: "Корень",
    parent_id: null,
    node_type: "room",
    segment_id: null,
    with_rights: true,
    room_id: 1,
    children: [
      {
        id: 2069228,
        is_const: 0,
        name: "Этаж",
        parent_id: 1,
        node_type: "room",
        segment_id: null,
        with_rights: true,
        room_id: 2069228,
      },
    ],
  },
];

const DETAIL = {
  id: 39094375,
  name: "Шаблон A",
  comment: null,
  access: [
    {
      access_zone_id: 2069228,
      template_type: 0,
      rights: {
        is_guard: 1,
        is_antipass: 0,
        is_verify: 0,
        schedule_type: { id: 1, name: "Временные зоны" },
        schedule: { id: 2, name: "Всегда" },
      },
    },
  ],
};

function fakeClient(): PercoClient {
  const list = templateListSchema.parse([
    { id: 39094375, name: "Шаблон A", comment: "", is_removed: 0 },
  ]);
  return {
    getRoomsTree: async () => roomsTreeSchema.parse(TREE),
    getTemplateList: async () => list,
    getTemplateDetail: async (id: number) => templateDetailSchema.parse({ ...DETAIL, id }),
  } as unknown as PercoClient;
}

function buildApp(db: DB, refresh: RefreshState): FastifyInstance {
  const app = Fastify();
  void registerApiRoutes(app, { db, refresh, importantTemplates: [] });
  return app;
}

async function waitIdle(app: FastifyInstance): Promise<RefreshStatus> {
  for (;;) {
    const res = await app.inject({ method: "GET", url: "/api/refresh/status" });
    const status = res.json() as RefreshStatus;
    if (!status.running) return status;
    await new Promise((r) => setTimeout(r, 5));
  }
}

test("GET /api/state/matrix отдаёт rooms/templates/cells/meta", async () => {
  const db = openDb(":memory:");
  replaceRooms(db, roomsTreeSchema.parse(TREE));
  replaceTemplates(db, templateListSchema.parse([{ id: 39094375, name: "A", comment: "", is_removed: 0 }]));
  saveTemplateAccess(db, templateDetailSchema.parse(DETAIL));

  const app = buildApp(db, new RefreshState(db, fakeClient(), 4));
  const res = await app.inject({ method: "GET", url: "/api/state/matrix" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as MatrixResponse;
  assert.equal(body.rooms.length, 2);
  assert.equal(body.templates.length, 1);
  assert.equal(body.cells.length, 1);
  assert.equal(body.cells[0]!.roomId, 2069228);
  assert.equal(body.cells[0]!.isGuard, true);
  assert.equal(body.cells[0]!.scheduleName, "Всегда");
  assert.equal(body.meta.roomsCount, 2);
  await app.close();
});

test("POST /api/refresh/all запускает обновление и наполняет кэш", async () => {
  const db = openDb(":memory:");
  const app = buildApp(db, new RefreshState(db, fakeClient(), 4));

  const res = await app.inject({ method: "POST", url: "/api/refresh/all" });
  assert.equal(res.statusCode, 200);
  assert.equal((res.json() as { started: boolean }).started, true);

  const status = await waitIdle(app);
  assert.equal(status.error, null);

  const matrix = (await app.inject({ method: "GET", url: "/api/state/matrix" }).then((r) => r.json())) as MatrixResponse;
  assert.equal(matrix.rooms.length, 2);
  assert.equal(matrix.cells.length, 1);
  assert.ok(matrix.meta.lastUpdateTemplates, "должна быть отметка времени обновления шаблонов");
  await app.close();
});

test("POST /api/refresh/:kind отклоняет неизвестный тип (400)", async () => {
  const db = openDb(":memory:");
  const app = buildApp(db, new RefreshState(db, fakeClient(), 4));
  const res = await app.inject({ method: "POST", url: "/api/refresh/garbage" });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("POST /api/refresh/all дважды подряд → второй 409", async () => {
  const db = openDb(":memory:");
  // медленный клиент, чтобы первое обновление ещё шло
  const slow = {
    getRoomsTree: async () => {
      await new Promise((r) => setTimeout(r, 50));
      return roomsTreeSchema.parse(TREE);
    },
    getTemplateList: async () => templateListSchema.parse([]),
    getTemplateDetail: async (id: number) => templateDetailSchema.parse({ ...DETAIL, id }),
  } as unknown as PercoClient;

  const app = buildApp(db, new RefreshState(db, slow, 4));
  const first = await app.inject({ method: "POST", url: "/api/refresh/all" });
  const second = await app.inject({ method: "POST", url: "/api/refresh/all" });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 409);

  await waitIdle(app);
  await app.close();
});
