import { test } from "node:test";
import assert from "node:assert/strict";
import type { Room, Template } from "@perco/shared";
import {
    intersect,
    nameMatches,
    resolveTemplateIds,
    roomIdsMatchingName,
    sortTemplates,
} from "./search.js";

function tpl(p: Partial<Template> & { id: number; name: string }): Template {
    return { comment: null, isRemoved: false, roomCount: 0, employeeCount: null, ...p };
}

test("nameMatches: подстрока без регистра, пустой запрос = всё", () => {
    assert.equal(nameMatches("Шаблон 310", "310"), true);
    assert.equal(nameMatches("Шаблон 310", "шаблон"), true);
    assert.equal(nameMatches("Шаблон 310", "  "), true);
    assert.equal(nameMatches("Шаблон 310", "999"), false);
});

test("sortTemplates: по имени по убыванию", () => {
    const list = [tpl({ id: 1, name: "Б" }), tpl({ id: 2, name: "А" }), tpl({ id: 3, name: "В" })];
    assert.deepEqual(
        sortTemplates(list, "name", "desc").map((t) => t.name),
        ["В", "Б", "А"],
    );
});

test("sortTemplates: по помещениям по убыванию", () => {
    const list = [
        tpl({ id: 1, name: "A", roomCount: 5 }),
        tpl({ id: 2, name: "B", roomCount: 50 }),
        tpl({ id: 3, name: "C", roomCount: 12 }),
    ];
    assert.deepEqual(
        sortTemplates(list, "rooms", "desc").map((t) => t.id),
        [2, 3, 1],
    );
});

test("sortTemplates: по сотрудникам, null всегда в конце", () => {
    const list = [
        tpl({ id: 1, name: "A", employeeCount: 10 }),
        tpl({ id: 2, name: "B", employeeCount: null }),
        tpl({ id: 3, name: "C", employeeCount: 100 }),
    ];
    // desc: 100, 10, null
    assert.deepEqual(
        sortTemplates(list, "employees", "desc").map((t) => t.id),
        [3, 1, 2],
    );
    // asc: 10, 100, null (null всё равно в конце)
    assert.deepEqual(
        sortTemplates(list, "employees", "asc").map((t) => t.id),
        [1, 3, 2],
    );
});

test("resolveTemplateIds: по id и по имени, без дублей, в порядке конфига", () => {
    const list = [
        tpl({ id: 39094478, name: "310" }),
        tpl({ id: 100, name: "Проходная" }),
        tpl({ id: 200, name: "Проходная" }), // дубль имени
    ];
    // "100" — id; "310" — имя; "Проходная" — имя (id 100 уже учтён, добавится 200)
    assert.deepEqual(resolveTemplateIds(list, ["100", "310", "Проходная"]), [100, 39094478, 200]);
    // несуществующие и пустые игнорируются
    assert.deepEqual(resolveTemplateIds(list, ["нет такого", "  "]), []);
});

test("roomIdsMatchingName + intersect", () => {
    const rooms: Room[] = [
        { id: 1, parentId: null, name: "Кабинет 101", roomId: 1, nodeType: "room", isConst: false, withRights: true, depth: 0, sortOrder: 0 },
        { id: 2, parentId: null, name: "Склад", roomId: 2, nodeType: "room", isConst: false, withRights: true, depth: 0, sortOrder: 1 },
        { id: 3, parentId: null, name: "Кабинет 102", roomId: 3, nodeType: "room", isConst: false, withRights: true, depth: 0, sortOrder: 2 },
    ];
    const m = roomIdsMatchingName(rooms, "кабинет");
    assert.deepEqual([...m].sort((a, b) => a - b), [1, 3]);
    assert.equal(roomIdsMatchingName(rooms, "").size, 0); // пустой запрос — пустое множество
    assert.deepEqual([...intersect(m, new Set([3, 9]))], [3]);
});
