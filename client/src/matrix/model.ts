// Чистая логика матрицы: индекс ячеек, дерево помещений, сворачивание, формат ячейки.
// Без React — тестируется отдельно.
import type { MatrixCell, Room, Template } from "@perco/shared";

export interface RoomRow extends Room {
    hasChildren: boolean;
}

/** Ключ ячейки в индексе: шаблон × помещение (по room_id == access_zone_id). */
export function cellKey(templateId: number, roomId: number): string {
    return `${templateId}:${roomId}`;
}

export function buildCellIndex(cells: MatrixCell[]): Map<string, MatrixCell> {
    const map = new Map<string, MatrixCell>();
    for (const c of cells) map.set(cellKey(c.templateId, c.roomId), c);
    return map;
}

/** Пометить помещения признаком наличия детей (для отрисовки «галочки» сворачивания). */
export function annotateRooms(rooms: Room[]): RoomRow[] {
    const parents = new Set<number>();
    for (const r of rooms) if (r.parentId !== null) parents.add(r.parentId);
    return rooms.map((r) => ({ ...r, hasChildren: parents.has(r.id) }));
}

/**
 * Видимые строки с учётом свёрнутых узлов. Список — в DFS-порядке с полем depth,
 * поэтому потомки идут подряд с большей глубиной: при встрече свёрнутого узла
 * пропускаем все последующие строки глубже него.
 *
 * `keep` (необязательно) — множество room.id, которые разрешено показывать
 * (режим фильтра-скрытия); строки не из этого множества опускаются.
 */
export function computeVisibleRooms(
    rooms: RoomRow[],
    collapsed: ReadonlySet<number>,
    keep?: ReadonlySet<number>,
): RoomRow[] {
    const out: RoomRow[] = [];
    let hideDeeperThan = Infinity;
    for (const r of rooms) {
        if (r.depth > hideDeeperThan) continue; // скрытый потомок свёрнутого узла
        hideDeeperThan = Infinity; // вышли из скрытого поддерева
        if (keep && !keep.has(r.id)) continue; // отфильтрован
        out.push(r);
        if (r.hasChildren && collapsed.has(r.id)) hideDeeperThan = r.depth;
    }
    return out;
}

/**
 * Таблица аббревиатур графиков → одна буква (узкие ячейки).
 * Полное название всегда видно в подсказке и инфо-баре.
 * Дополняйте таблицу по мере появления новых графиков.
 */
export const SCHEDULE_ABBR: Record<string, string> = {
    Всегда: "В",
    Никогда: "Н",
    "С 8 до 21 кроме вскр": "Б", // рабочий
    "С 8 до 21 все дни": "О", // продлённый
    "тест-до14:00": "Т",
};

/** Аббревиатура графика; fallback — первая буква названия (или «•»). */
export function scheduleAbbr(name: string): string {
    const hit = SCHEDULE_ABBR[name];
    if (hit) return hit;
    const ch = name.trim()[0];
    return ch ? ch.toUpperCase() : "•";
}

/** Краткий текст ячейки: одна буква графика доступа. */
export function cellText(cell: MatrixCell): string {
    return scheduleAbbr(cell.scheduleName);
}

/** Подробное описание ячейки для tooltip. */
export function describeCell(cell: MatrixCell, template: Template, room: Room): string {
    return [
        `Шаблон: ${template.name}`,
        `Помещение: ${room.name || `#${room.roomId}`}`,
        `График: ${cell.scheduleName} (${cell.scheduleTypeName})`,
        `Охрана: ${cell.isGuard ? "да" : "нет"}`,
        `Antipass: ${cell.isAntipass ? "да" : "нет"}`,
    ].join("\n");
}
