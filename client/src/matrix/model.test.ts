import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatrixCell, Room } from "@perco/shared";
import {
  annotateRooms,
  buildCellIndex,
  cellKey,
  computeVisibleRooms,
  cellText,
  scheduleAbbr,
} from "./model.js";

function room(partial: Partial<Room> & { id: number; depth: number }): Room {
  return {
    parentId: null,
    name: `R${partial.id}`,
    roomId: partial.id,
    nodeType: "room",
    isConst: false,
    withRights: true,
    sortOrder: partial.id,
    ...partial,
  };
}

// Дерево: 1 → 2 → 3, и сосед 4 под корнем 1
const ROOMS: Room[] = [
  room({ id: 1, depth: 0, parentId: null, sortOrder: 0 }),
  room({ id: 2, depth: 1, parentId: 1, sortOrder: 1 }),
  room({ id: 3, depth: 2, parentId: 2, sortOrder: 2 }),
  room({ id: 4, depth: 1, parentId: 1, sortOrder: 3 }),
];

test("annotateRooms: hasChildren вычисляется по parentId", () => {
  const a = annotateRooms(ROOMS);
  assert.deepEqual(
    a.map((r) => [r.id, r.hasChildren]),
    [
      [1, true],
      [2, true],
      [3, false],
      [4, false],
    ],
  );
});

test("computeVisibleRooms: свёрнутый узел скрывает всех потомков", () => {
  const a = annotateRooms(ROOMS);
  const visible = computeVisibleRooms(a, new Set([2]));
  // узел 2 свёрнут → 3 скрыт, 4 (сосед) остаётся
  assert.deepEqual(
    visible.map((r) => r.id),
    [1, 2, 4],
  );
});

test("computeVisibleRooms: свёрнутый корень скрывает всё поддерево", () => {
  const a = annotateRooms(ROOMS);
  const visible = computeVisibleRooms(a, new Set([1]));
  assert.deepEqual(
    visible.map((r) => r.id),
    [1],
  );
});

test("buildCellIndex + cellKey", () => {
  const cells: MatrixCell[] = [
    {
      templateId: 10,
      roomId: 2,
      isGuard: true,
      isAntipass: false,
      scheduleTypeId: 1,
      scheduleTypeName: "Временные зоны",
      scheduleId: 2,
      scheduleName: "Всегда",
    },
  ];
  const idx = buildCellIndex(cells);
  assert.equal(idx.size, 1);
  const cell = idx.get(cellKey(10, 2))!;
  assert.equal(cell.scheduleName, "Всегда");
  assert.equal(cellText(cell), "В"); // аббревиатура графика
  assert.equal(idx.get(cellKey(10, 999)), undefined);
});

test("scheduleAbbr: таблица + fallback на первую букву", () => {
  assert.equal(scheduleAbbr("Всегда"), "В");
  assert.equal(scheduleAbbr("С 8 до 21 все дни"), "О");
  assert.equal(scheduleAbbr("Неизвестный график"), "Н"); // fallback
  assert.equal(scheduleAbbr("   "), "•"); // пустое
});
