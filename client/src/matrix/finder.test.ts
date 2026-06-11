import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatrixCell, Template } from "@perco/shared";
import { buildCellIndex } from "./model.js";
import {
  ANY_SPEC,
  cellSatisfies,
  findFullMatches,
  greedySetCover,
  specLabel,
  templateSatisfies,
  type CellSpec,
  type Requirement,
} from "./finder.js";

function cell(p: Partial<MatrixCell> & { templateId: number; roomId: number }): MatrixCell {
  return {
    isGuard: false,
    isAntipass: false,
    scheduleTypeId: 1,
    scheduleTypeName: "ВЗ",
    scheduleId: 2,
    scheduleName: "Всегда",
    ...p,
  };
}
function tpl(id: number): Template {
  return { id, name: `T${id}`, comment: null, isRemoved: false, roomCount: 0, employeeCount: null };
}
const spec = (p: Partial<CellSpec>): CellSpec => ({ ...ANY_SPEC, ...p });

test("cellSatisfies: нет ячейки → false; график/охрана/antipass", () => {
  assert.equal(cellSatisfies(undefined, ANY_SPEC), false);
  const c = cell({ templateId: 1, roomId: 1, scheduleId: 2, isGuard: true });
  assert.equal(cellSatisfies(c, ANY_SPEC), true);
  assert.equal(cellSatisfies(c, spec({ scheduleId: 2 })), true);
  assert.equal(cellSatisfies(c, spec({ scheduleId: 9 })), false);
  assert.equal(cellSatisfies(c, spec({ guard: "yes" })), true);
  assert.equal(cellSatisfies(c, spec({ guard: "no" })), false);
  assert.equal(cellSatisfies(c, spec({ antipass: "yes" })), false);
});

test("specLabel: график (или «·»), охрана О/о, antipass А/а", () => {
  const names = new Map([[2, "Всегда"]]);
  assert.equal(specLabel(ANY_SPEC, names), "·");
  assert.equal(specLabel(spec({ scheduleId: 2 }), names), "В");
  assert.equal(specLabel(spec({ scheduleId: 9 }), names), "•"); // неизвестный график
  assert.equal(specLabel(spec({ guard: "yes", antipass: "no" }), names), "·Оа");
  assert.equal(specLabel(spec({ guard: "no", antipass: "yes" }), names), "·оА");
});

test("templateSatisfies / findFullMatches: покрытие всех требуемых", () => {
  // T1 даёт доступ в 10 и 20; T2 только в 10
  const idx = buildCellIndex([
    cell({ templateId: 1, roomId: 10 }),
    cell({ templateId: 1, roomId: 20 }),
    cell({ templateId: 2, roomId: 10 }),
  ]);
  const req: Requirement = new Map([
    [10, ANY_SPEC],
    [20, ANY_SPEC],
  ]);
  assert.deepEqual([...templateSatisfies(idx, 1, req)].sort((a, b) => a - b), [10, 20]);
  assert.deepEqual([...templateSatisfies(idx, 2, req)], [10]);
  assert.deepEqual(findFullMatches([tpl(1), tpl(2)], idx, req), [1]); // только T1 целиком
});

test("findFullMatches учитывает отметки", () => {
  const idx = buildCellIndex([
    cell({ templateId: 1, roomId: 10, isGuard: true }),
    cell({ templateId: 2, roomId: 10, isGuard: false }),
  ]);
  const req: Requirement = new Map([[10, spec({ guard: "yes" })]]);
  assert.deepEqual(findFullMatches([tpl(1), tpl(2)], idx, req), [1]);
});

test("greedySetCover: два шаблона вместе покрывают, один остаётся непокрытым", () => {
  // T1: {10,20}; T2: {20,30}; помещение 40 не покрывает никто
  const idx = buildCellIndex([
    cell({ templateId: 1, roomId: 10 }),
    cell({ templateId: 1, roomId: 20 }),
    cell({ templateId: 2, roomId: 20 }),
    cell({ templateId: 2, roomId: 30 }),
  ]);
  const req: Requirement = new Map([
    [10, ANY_SPEC],
    [20, ANY_SPEC],
    [30, ANY_SPEC],
    [40, ANY_SPEC],
  ]);
  const res = greedySetCover([tpl(1), tpl(2)], idx, req);
  // оба шаблона покрывают по 2; жадность берёт любой первым, второй добивает остальное
  const coveredRooms = new Set(res.chosen.flatMap((c) => c.covers));
  assert.deepEqual([...coveredRooms].sort((a, b) => a - b), [10, 20, 30]);
  assert.equal(res.chosen.length, 2);
  assert.deepEqual(res.uncovered, [40]);
});

test("greedySetCover: пустое требование → ничего", () => {
  const res = greedySetCover([tpl(1)], buildCellIndex([]), new Map());
  assert.deepEqual(res.chosen, []);
  assert.deepEqual(res.uncovered, []);
});
