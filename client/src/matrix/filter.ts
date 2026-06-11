// Чистая логика фильтрации/подсветки по значениям ячеек.
import type { MatrixCell, Room } from "@perco/shared";

export type TriState = "any" | "yes" | "no";
export type FilterMode = "highlight" | "filter";

/** Критерии соответствия ячейки: график/охрана/antipass. Общие для фильтра и подбора. */
export interface CellCriteria {
  scheduleId: number | null; // null = любой график
  guard: TriState;
  antipass: TriState;
}

export interface FilterState extends CellCriteria {
  active: boolean;
  mode: FilterMode;
}

export const EMPTY_FILTER: FilterState = {
  active: false,
  mode: "highlight",
  scheduleId: null,
  guard: "any",
  antipass: "any",
};

function triMatch(state: TriState, value: boolean): boolean {
  if (state === "any") return true;
  return state === "yes" ? value : !value;
}

/** Подходит ли ячейка под критерии. Наличие ячейки = есть доступ. */
export function matchCell(cell: MatrixCell, f: CellCriteria): boolean {
  if (f.scheduleId !== null && cell.scheduleId !== f.scheduleId) return false;
  if (!triMatch(f.guard, cell.isGuard)) return false;
  if (!triMatch(f.antipass, cell.isAntipass)) return false;
  return true;
}

export interface MatchSets {
  /** id шаблонов, у которых есть хотя бы одна подходящая ячейка */
  templateIds: Set<number>;
  /** roomId помещений, у которых есть хотя бы одна подходящая ячейка */
  roomIds: Set<number>;
}

export function computeMatches(cells: MatrixCell[], f: FilterState): MatchSets {
  const templateIds = new Set<number>();
  const roomIds = new Set<number>();
  for (const c of cells) {
    if (matchCell(c, f)) {
      templateIds.add(c.templateId);
      roomIds.add(c.roomId);
    }
  }
  return { templateIds, roomIds };
}

/**
 * Для режима скрытия: множество room.id, которые надо оставить — это подходящие
 * помещения плюс все их предки (чтобы сохранить путь в дереве).
 */
export function roomsWithAncestors(rooms: Room[], matchedRoomIds: Set<number>): Set<number> {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const keep = new Set<number>();
  for (const r of rooms) {
    if (!matchedRoomIds.has(r.roomId)) continue;
    let cur: Room | undefined = r;
    while (cur && !keep.has(cur.id)) {
      keep.add(cur.id);
      cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined;
    }
  }
  return keep;
}

/** Уникальные графики из ячеек — для выпадающего списка фильтра. */
export function uniqueSchedules(cells: MatrixCell[]): Array<{ id: number; name: string }> {
  const map = new Map<number, string>();
  for (const c of cells) if (!map.has(c.scheduleId)) map.set(c.scheduleId, c.scheduleName);
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
