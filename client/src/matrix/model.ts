// Чистая логика матрицы: индекс ячеек, дерево помещений, сворачивание, формат ячейки.
// Без React — тестируется отдельно.
import type { MatrixCell, Room, Template } from "@perco/shared";
import type { SortDir } from "./search.js";

export interface RoomRow extends Room {
    hasChildren: boolean;
}

/** Ключ сортировки помещений: "tree" = исходный порядок PERCo, "name" = по имени. */
export type RoomSortKey = "tree" | "name";

/**
 * Сортировка помещений С СОХРАНЕНИЕМ ДЕРЕВА: упорядочиваем соседей (детей одного
 * родителя), но потомки всегда идут сразу за своим родителем с большей глубиной —
 * то есть результат остаётся корректным DFS-списком (как ждут computeVisibleRooms
 * и логика сворачивания). "tree" восстанавливает исходный порядок (по sortOrder).
 */
export function sortRoomsTree(rooms: RoomRow[], key: RoomSortKey, dir: SortDir): RoomRow[] {
    const sign = dir === "asc" ? 1 : -1;
    const byName = (a: RoomRow, b: RoomRow): number =>
        (a.name || `#${a.roomId}`).localeCompare(b.name || `#${b.roomId}`, "ru");
    const cmp = (a: RoomRow, b: RoomRow): number => {
        if (key === "name") {
            const c = byName(a, b) * sign;
            return c !== 0 ? c : a.sortOrder - b.sortOrder; // стабильность по исходному порядку
        }
        return (a.sortOrder - b.sortOrder) * sign;
    };

    // Группируем по родителю (в исходном порядке); корни — без родителя или со
    // ссылкой на отсутствующего родителя (защита от «висячих» ссылок, чтобы не
    // потерять строки).
    const ids = new Set(rooms.map((r) => r.id));
    const childrenByParent = new Map<number, RoomRow[]>();
    const roots: RoomRow[] = [];
    for (const r of rooms) {
        if (r.parentId === null || !ids.has(r.parentId)) {
            roots.push(r);
        } else {
            const arr = childrenByParent.get(r.parentId);
            if (arr) arr.push(r);
            else childrenByParent.set(r.parentId, [r]);
        }
    }

    const out: RoomRow[] = [];
    const walk = (nodes: RoomRow[]): void => {
        for (const n of [...nodes].sort(cmp)) {
            out.push(n);
            const kids = childrenByParent.get(n.id);
            if (kids) walk(kids);
        }
    };
    walk(roots);
    return out;
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
 * Аббревиатура графика → одна буква (узкие ячейки). Таблица `abbr` (имя → буква)
 * приходит из конфига сервера (env SCHEDULE_ABBR); жёстко в коде названий нет.
 * Если имя не найдено — fallback на первую букву названия (или «•»).
 */
export function scheduleAbbr(name: string, abbr: Record<string, string> = {}): string {
    const hit = abbr[name];
    if (hit) return hit;
    const ch = name.trim()[0];
    return ch ? ch.toUpperCase() : "•";
}

/** Краткий текст ячейки: одна буква графика доступа. */
export function cellText(cell: MatrixCell, abbr: Record<string, string> = {}): string {
    return scheduleAbbr(cell.scheduleName, abbr);
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
