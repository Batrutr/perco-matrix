import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatrixCell, Room } from "@perco/shared";
import {
    computeMatches,
    matchCell,
    roomsWithAncestors,
    uniqueSchedules,
    type FilterState,
} from "./filter.js";

function cell(p: Partial<MatrixCell> & { templateId: number; roomId: number }): MatrixCell {
    return {
        isGuard: false,
        isAntipass: false,
        scheduleTypeId: 1,
        scheduleTypeName: "Временные зоны",
        scheduleId: 2,
        scheduleName: "Всегда",
        ...p,
    };
}

const base: FilterState = {
    active: true,
    mode: "highlight",
    scheduleId: null,
    guard: "any",
    antipass: "any",
};

test("matchCell: график, охрана, antipass", () => {
    const c = cell({ templateId: 1, roomId: 1, isGuard: true, scheduleId: 5, scheduleName: "Ночь" });
    assert.equal(matchCell(c, base), true);
    assert.equal(matchCell(c, { ...base, scheduleId: 5 }), true);
    assert.equal(matchCell(c, { ...base, scheduleId: 9 }), false);
    assert.equal(matchCell(c, { ...base, guard: "yes" }), true);
    assert.equal(matchCell(c, { ...base, guard: "no" }), false);
    assert.equal(matchCell(c, { ...base, antipass: "yes" }), false);
});

test("computeMatches: собирает id шаблонов и roomId", () => {
    const cells = [
        cell({ templateId: 1, roomId: 10, isGuard: true }),
        cell({ templateId: 2, roomId: 20, isGuard: false }),
    ];
    const m = computeMatches(cells, { ...base, guard: "yes" });
    assert.deepEqual([...m.templateIds], [1]);
    assert.deepEqual([...m.roomIds], [10]);
});

test("roomsWithAncestors: оставляет путь до совпавшего помещения", () => {
    const rooms: Room[] = [
        { id: 1, parentId: null, name: "A", roomId: 1, nodeType: "room", isConst: false, withRights: true, depth: 0, sortOrder: 0 },
        { id: 2, parentId: 1, name: "B", roomId: 2, nodeType: "room", isConst: false, withRights: true, depth: 1, sortOrder: 1 },
        { id: 3, parentId: 2, name: "C", roomId: 3, nodeType: "room", isConst: false, withRights: true, depth: 2, sortOrder: 2 },
        { id: 4, parentId: 1, name: "D", roomId: 4, nodeType: "room", isConst: false, withRights: true, depth: 1, sortOrder: 3 },
    ];
    const keep = roomsWithAncestors(rooms, new Set([3])); // совпало C
    assert.deepEqual([...keep].sort((a, b) => a - b), [1, 2, 3]); // C + предки B,A; D исключён
});

test("uniqueSchedules: уникальные графики, отсортированы", () => {
    const cells = [
        cell({ templateId: 1, roomId: 1, scheduleId: 3, scheduleName: "Рабочее" }),
        cell({ templateId: 1, roomId: 2, scheduleId: 2, scheduleName: "Всегда" }),
        cell({ templateId: 2, roomId: 3, scheduleId: 3, scheduleName: "Рабочее" }),
    ];
    assert.deepEqual(uniqueSchedules(cells), [
        { id: 2, name: "Всегда" },
        { id: 3, name: "Рабочее" },
    ]);
});
