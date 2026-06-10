import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatrixCell, Room } from "@perco/shared";
import {
  roomIdsWithAccessInTemplate,
  roomsVisibleAfterHiding,
  templateIdsWithAccessInRoom,
} from "./hide.js";

function room(id: number, parentId: number | null): Room {
  return {
    id,
    parentId,
    name: `R${id}`,
    roomId: id,
    nodeType: "room",
    isConst: false,
    withRights: true,
    depth: parentId === null ? 0 : 1,
    sortOrder: id,
  };
}

function cell(templateId: number, roomId: number): MatrixCell {
  return {
    templateId,
    roomId,
    isGuard: false,
    isAntipass: false,
    scheduleTypeId: 1,
    scheduleTypeName: "x",
    scheduleId: 2,
    scheduleName: "y",
  };
}

const CELLS = [cell(10, 2), cell(10, 3), cell(20, 4)];

test("roomIdsWithAccessInTemplate / templateIdsWithAccessInRoom", () => {
  assert.deepEqual([...roomIdsWithAccessInTemplate(CELLS, 10)].sort((a, b) => a - b), [2, 3]);
  assert.deepEqual([...templateIdsWithAccessInRoom(CELLS, 2)], [10]);
  assert.equal(roomIdsWithAccessInTemplate(CELLS, 999).size, 0);
});

test("roomsVisibleAfterHiding: предки видимых остаются, пустые ветки уходят", () => {
  // дерево: 1 → {2 → {3}, 4}
  const rooms: Room[] = [
    room(1, null),
    { ...room(2, 1), depth: 1 },
    { ...room(3, 2), depth: 2 },
    { ...room(4, 1), depth: 1 },
  ];
  // скрываем 3 и 4 (по roomId). Видны: 1 (есть нескрытый потомок 2), 2 (сам не скрыт)
  const visible = roomsVisibleAfterHiding(rooms, new Set([3, 4]));
  assert.deepEqual([...visible].sort((a, b) => a - b), [1, 2]);

  // скрываем 2,3,4 — у 1 не осталось видимых потомков, но сам 1 не скрыт → виден
  const v2 = roomsVisibleAfterHiding(rooms, new Set([2, 3, 4]));
  assert.deepEqual([...v2], [1]);

  // скрываем всё → пусто
  const v3 = roomsVisibleAfterHiding(rooms, new Set([1, 2, 3, 4]));
  assert.equal(v3.size, 0);
});
