// Тесты Этапа 1: схемы, разворачивание дерева, пул параллелизма, оркестрация sync.
// Сеть не используется — PercoClient подменяется фейком с данными из задания.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "./db.js";
import { roomsTreeSchema, templateDetailSchema, templateListSchema } from "./perco/schemas.js";
import { flattenTree, replaceRooms, saveTemplateAccess } from "./repo.js";
import { runWithConcurrency } from "./util/pool.js";
import { withRetry } from "./util/retry.js";
import { RefreshState } from "./sync.js";
import type { PercoClient } from "./perco/client.js";

// --- Примеры из task.md ---
const SAMPLE_TREE = [
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
        children: [
          {
            id: 39055499,
            is_const: 0,
            name: "Кабинет",
            parent_id: 2069228,
            node_type: "room",
            segment_id: null,
            with_rights: true,
            room_id: 39055499,
          },
        ],
      },
    ],
  },
];

const SAMPLE_DETAIL = {
  id: 39094375,
  name: "Шаблон A",
  comment: null,
  access: [
    {
      access_zone_id: 2069228,
      template_type: 0,
      rights: {
        is_guard: 0,
        is_antipass: 1,
        is_verify: 0,
        right_type: { id: 1, name: "Карта" },
        commission_type: { id: 0, name: "Нет" },
        commission_group_1: 0,
        commission_group_2: 0,
        template_type_name: "PERCo",
        schedule_type: { id: 1, name: "Временные зоны" },
        schedule: { id: 2, name: "Всегда" },
        verify_po_schedule: { id: 0, name: "Нет" },
        verify_pdu_schedule: { id: 0, name: "Нет" },
        verify_vvu_schedule: { id: 0, name: "Нет" },
        verify_alcobarier_schedule: { id: 0, name: "Нет" },
      },
    },
  ],
};

test("roomsTreeSchema принимает дерево из задания", () => {
  const parsed = roomsTreeSchema.parse(SAMPLE_TREE);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.children!.length, 1);
});

test("flattenTree: порядок DFS, depth и sortOrder", () => {
  const flat = flattenTree(roomsTreeSchema.parse(SAMPLE_TREE));
  assert.deepEqual(
    flat.map((r) => [r.id, r.depth, r.sortOrder]),
    [
      [1, 0, 0],
      [2069228, 1, 1],
      [39055499, 2, 2],
    ],
  );
});

test("templateDetailSchema парсит детали и сохраняет права", () => {
  const detail = templateDetailSchema.parse(SAMPLE_DETAIL);
  const db = openDb(":memory:");
  saveTemplateAccess(db, detail);
  const row = db
    .prepare("SELECT * FROM template_access WHERE template_id = ? AND access_zone_id = ?")
    .get(detail.id, 2069228) as Record<string, unknown>;
  assert.equal(row.is_antipass, 1);
  assert.equal(row.schedule_type_name, "Временные зоны");
  assert.equal(row.schedule_name, "Всегда");
});

test("runWithConcurrency: порядок результатов и соблюдение лимита", async () => {
  let active = 0;
  let maxActive = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);
  const out = await runWithConcurrency(items, 4, async (n) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 1));
    active--;
    return n * 2;
  });
  assert.deepEqual(
    out,
    items.map((n) => n * 2),
  );
  assert.ok(maxActive <= 4, `превышен лимит параллелизма: ${maxActive}`);
});

test("withRetry: повторяет транзиентную ошибку и в итоге успешно", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "ok";
    },
    { retries: 3, baseDelayMs: 1, isRetryable: () => true },
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetry: не повторяет нетранзиентную ошибку", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new Error("permanent");
      },
      { retries: 3, baseDelayMs: 1, isRetryable: () => false },
    ),
  );
  assert.equal(calls, 1);
});

test("RefreshState: полное обновление наполняет БД и доводит прогресс", async () => {
  const db = openDb(":memory:");
  replaceRooms(db, roomsTreeSchema.parse(SAMPLE_TREE)); // заранее, проверяем перезапись

  const list = templateListSchema.parse([
    { id: 39094375, name: "Шаблон A", comment: "", is_removed: 0 },
    { id: 39094478, name: "Шаблон B", comment: "", is_removed: 0 },
  ]);

  const fake = {
    getRoomsTree: async () => roomsTreeSchema.parse(SAMPLE_TREE),
    getTemplateList: async () => list,
    getTemplateDetail: async (id: number) =>
      templateDetailSchema.parse({ ...SAMPLE_DETAIL, id }),
  } as unknown as PercoClient;

  const state = new RefreshState(db, fake, 8);
  assert.equal(state.start("all"), true);
  assert.equal(state.start("all"), false, "второе обновление не должно стартовать");

  // ждём завершения
  while (state.getStatus().running) {
    await new Promise((r) => setTimeout(r, 5));
  }

  const status = state.getStatus();
  assert.equal(status.error, null);
  assert.equal(status.done, 2);
  assert.equal(status.total, 2);

  const rooms = db.prepare("SELECT COUNT(*) AS c FROM rooms").get() as { c: number };
  const access = db.prepare("SELECT COUNT(*) AS c FROM template_access").get() as { c: number };
  assert.equal(rooms.c, 3);
  assert.equal(access.c, 2); // по одной зоне на каждый из двух шаблонов
});
