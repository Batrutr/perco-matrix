// Поиск по шаблонам/помещениям (всегда на виду) и сортировка (в поповере —
// используется редко, постоянную высоту тулбара занимать не должна).
import type { SortDir, SortKey } from "../matrix/search.js";
import type { RoomSortKey } from "../matrix/model.js";
import { ToolbarPopover } from "./ToolbarPopover.js";

interface Props {
    templateQuery: string;
    roomQuery: string;
    sortKey: SortKey;
    sortDir: SortDir;
    roomSortKey: RoomSortKey;
    roomSortDir: SortDir;
    onTemplateQuery: (v: string) => void;
    onRoomQuery: (v: string) => void;
    onSort: (key: SortKey, dir: SortDir) => void;
    onRoomSort: (key: RoomSortKey, dir: SortDir) => void;
}

const SORT_OPTIONS: Array<{ value: string; label: string; key: SortKey; dir: SortDir }> = [
    { value: "name:asc", label: "Имя (А→Я)", key: "name", dir: "asc" },
    { value: "name:desc", label: "Имя (Я→А)", key: "name", dir: "desc" },
    { value: "rooms:desc", label: "Помещений (больше)", key: "rooms", dir: "desc" },
    { value: "rooms:asc", label: "Помещений (меньше)", key: "rooms", dir: "asc" },
    { value: "employees:desc", label: "Сотрудников (больше)", key: "employees", dir: "desc" },
    { value: "employees:asc", label: "Сотрудников (меньше)", key: "employees", dir: "asc" },
];

const ROOM_SORT_OPTIONS: Array<{ value: string; label: string; key: RoomSortKey; dir: SortDir }> = [
    { value: "tree:asc", label: "Как в PERCo", key: "tree", dir: "asc" },
    { value: "name:asc", label: "Имя (А→Я)", key: "name", dir: "asc" },
    { value: "name:desc", label: "Имя (Я→А)", key: "name", dir: "desc" },
];

/** Значения по умолчанию — при них триггер сортировки не подсвечивается. */
const DEFAULT_SORT = "name:asc";
const DEFAULT_ROOM_SORT = "tree:asc";

export function SearchSortBar({
    templateQuery,
    roomQuery,
    sortKey,
    sortDir,
    roomSortKey,
    roomSortDir,
    onTemplateQuery,
    onRoomQuery,
    onSort,
    onRoomSort,
}: Props) {
    const sortValue = `${sortKey}:${sortDir}`;
    const roomSortValue = `${roomSortKey}:${roomSortDir}`;
    const sortChanged = sortValue !== DEFAULT_SORT || roomSortValue !== DEFAULT_ROOM_SORT;

    return (
        <div className="search-bar">
            <span className="search-label">Поиск:</span>

            <input
                type="search"
                className="search-input"
                value={templateQuery}
                placeholder="шаблон…"
                title="Поиск по имени шаблона"
                aria-label="Поиск по имени шаблона"
                onChange={(e) => onTemplateQuery(e.target.value)}
            />

            <input
                type="search"
                className="search-input"
                value={roomQuery}
                placeholder="помещение…"
                title="Поиск по имени помещения"
                aria-label="Поиск по имени помещения"
                onChange={(e) => onRoomQuery(e.target.value)}
            />

            <ToolbarPopover
                label="Сортировка"
                title="Порядок столбцов-шаблонов и строк-помещений"
                active={sortChanged}
            >
                <label className="pop-row">
                    <span>Шаблоны</span>
                    <select
                        value={sortValue}
                        onChange={(e) => {
                            const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
                            if (opt) onSort(opt.key, opt.dir);
                        }}
                    >
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="pop-row">
                    <span>Помещения</span>
                    <select
                        value={roomSortValue}
                        onChange={(e) => {
                            const opt = ROOM_SORT_OPTIONS.find((o) => o.value === e.target.value);
                            if (opt) onRoomSort(opt.key, opt.dir);
                        }}
                    >
                        {ROOM_SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
            </ToolbarPopover>
        </div>
    );
}
