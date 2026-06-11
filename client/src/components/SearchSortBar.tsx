// Поиск по шаблонам/помещениям и сортировка шаблонов.
import type { SortDir, SortKey } from "../matrix/search.js";

interface Props {
    templateQuery: string;
    roomQuery: string;
    sortKey: SortKey;
    sortDir: SortDir;
    onTemplateQuery: (v: string) => void;
    onRoomQuery: (v: string) => void;
    onSort: (key: SortKey, dir: SortDir) => void;
}

const SORT_OPTIONS: Array<{ value: string; label: string; key: SortKey; dir: SortDir }> = [
    { value: "name:asc", label: "Имя (А→Я)", key: "name", dir: "asc" },
    { value: "name:desc", label: "Имя (Я→А)", key: "name", dir: "desc" },
    { value: "rooms:desc", label: "Помещений (больше)", key: "rooms", dir: "desc" },
    { value: "rooms:asc", label: "Помещений (меньше)", key: "rooms", dir: "asc" },
    { value: "employees:desc", label: "Сотрудников (больше)", key: "employees", dir: "desc" },
    { value: "employees:asc", label: "Сотрудников (меньше)", key: "employees", dir: "asc" },
];

export function SearchSortBar({
    templateQuery,
    roomQuery,
    sortKey,
    sortDir,
    onTemplateQuery,
    onRoomQuery,
    onSort,
}: Props) {
    return (
        <div className="search-bar">
            <label className="search-field">
                Поиск шаблона:
                <input
                    type="search"
                    value={templateQuery}
                    placeholder="имя шаблона"
                    onChange={(e) => onTemplateQuery(e.target.value)}
                />
            </label>

            <label className="search-field">
                Поиск помещения:
                <input
                    type="search"
                    value={roomQuery}
                    placeholder="имя помещения"
                    onChange={(e) => onRoomQuery(e.target.value)}
                />
            </label>

            <label className="search-field">
                Сортировка шаблонов:
                <select
                    value={`${sortKey}:${sortDir}`}
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
        </div>
    );
}
