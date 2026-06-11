// Логика скрытия столбцов/строк по критериям (контекстные меню).
import type { MatrixCell, Room } from "@perco/shared";
import { intersect } from "./search.js";

/** Какие критерии скрытия активны через данный источник (шаблон/помещение). */
export interface HideFlags {
  /** скрыты элементы БЕЗ доступа */
  noAccess: boolean;
  /** скрыты элементы С доступом */
  withAccess: boolean;
}

/**
 * Как комбинировать скрытия от нескольких источников (по видимому результату):
 *  - "all" (пересечение): видно то, что прошло ВСЕ скрытия → скрытое = объединение наборов
 *  - "any" (объединение): видно то, что прошло хотя бы одно → скрытое = пересечение наборов
 */
export type CombineMode = "all" | "any";

/** Свести наборы «что скрывает каждый источник» в итоговое множество скрытого. */
export function combineHidden(sets: Set<number>[], mode: CombineMode): Set<number> {
  if (sets.length === 0) return new Set();
  if (sets.length === 1) return new Set(sets[0]);
  if (mode === "all") {
    const out = new Set<number>();
    for (const s of sets) for (const x of s) out.add(x); // объединение скрытого
    return out;
  }
  let acc = new Set(sets[0]); // пересечение скрытого
  for (let i = 1; i < sets.length; i++) acc = intersect(acc, sets[i]!);
  return acc;
}

/** roomId помещений, в которые шаблон даёт доступ. */
export function roomIdsWithAccessInTemplate(cells: MatrixCell[], templateId: number): Set<number> {
  const s = new Set<number>();
  for (const c of cells) if (c.templateId === templateId) s.add(c.roomId);
  return s;
}

/** id шаблонов, дающих доступ в помещение. */
export function templateIdsWithAccessInRoom(cells: MatrixCell[], roomId: number): Set<number> {
  const s = new Set<number>();
  for (const c of cells) if (c.roomId === roomId) s.add(c.templateId);
  return s;
}

/**
 * Множество room.id, которые остаются видимыми после скрытия `hidden` (по roomId).
 * Помещение видно, если в его поддереве есть хотя бы одно нескрытое помещение —
 * так предки видимых строк сохраняются, а полностью скрытые ветки убираются.
 */
export function roomsVisibleAfterHiding(
  rooms: Room[],
  hidden: ReadonlySet<number>,
): Set<number> {
  const childrenByParent = new Map<number, number[]>();
  const byId = new Map<number, Room>();
  for (const r of rooms) {
    byId.set(r.id, r);
    if (r.parentId !== null) {
      const arr = childrenByParent.get(r.parentId);
      if (arr) arr.push(r.id);
      else childrenByParent.set(r.parentId, [r.id]);
    }
  }

  const memo = new Map<number, boolean>();
  const subtreeHasVisible = (id: number): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const room = byId.get(id);
    let res = room ? !hidden.has(room.roomId) : false;
    if (!res) {
      for (const childId of childrenByParent.get(id) ?? []) {
        if (subtreeHasVisible(childId)) {
          res = true;
          break;
        }
      }
    }
    memo.set(id, res);
    return res;
  };

  const visible = new Set<number>();
  for (const r of rooms) if (subtreeHasVisible(r.id)) visible.add(r.id);
  return visible;
}
