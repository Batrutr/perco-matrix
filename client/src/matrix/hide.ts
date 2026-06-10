// Логика скрытия столбцов/строк по критериям (контекстные меню).
import type { MatrixCell, Room } from "@perco/shared";

/** Какие критерии скрытия активны через данный источник (шаблон/помещение). */
export interface HideFlags {
  /** скрыты элементы БЕЗ доступа */
  noAccess: boolean;
  /** скрыты элементы С доступом */
  withAccess: boolean;
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
