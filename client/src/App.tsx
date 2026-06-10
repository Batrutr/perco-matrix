import { useCallback, useEffect, useMemo, useState } from "react";
import type { MatrixResponse } from "@perco/shared";
import { fetchMatrix } from "./api/client.js";
import { useRefresh } from "./hooks/useRefresh.js";
import { annotateRooms, buildCellIndex, computeVisibleRooms } from "./matrix/model.js";
import {
  computeMatches,
  EMPTY_FILTER,
  roomsWithAncestors,
  uniqueSchedules,
  type FilterState,
} from "./matrix/filter.js";
import {
  intersect,
  nameMatches,
  roomIdsMatchingName,
  sortTemplates,
  type SortDir,
  type SortKey,
} from "./matrix/search.js";
import { MatrixGrid, type HoverInfo } from "./matrix/MatrixGrid.js";
import { RefreshBar } from "./components/RefreshBar.js";
import { FilterPanel } from "./components/FilterPanel.js";
import { SearchSortBar } from "./components/SearchSortBar.js";
import "./App.css";

export function App() {
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [templateQuery, setTemplateQuery] = useState("");
  const [roomQuery, setRoomQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMatrix()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const refresh = useRefresh(load);

  const allRooms = useMemo(() => (data ? annotateRooms(data.rooms) : []), [data]);
  const cellIndex = useMemo(() => buildCellIndex(data?.cells ?? []), [data]);
  const schedules = useMemo(() => uniqueSchedules(data?.cells ?? []), [data]);

  const matches = useMemo(
    () => (filter.active && data ? computeMatches(data.cells, filter) : null),
    [filter, data],
  );

  const filterMode = filter.active && filter.mode === "filter";
  const highlightMode = filter.active && filter.mode === "highlight";

  // Строки: совмещаем поиск по помещению и фильтр-скрытие (пересечение совпавших
  // roomId), затем добавляем предков и применяем сворачивание.
  const roomKeep = useMemo(() => {
    if (!data) return undefined;
    let matchedRoomIds: Set<number> | null = null;
    if (roomQuery.trim()) matchedRoomIds = roomIdsMatchingName(data.rooms, roomQuery);
    if (filterMode && matches) {
      matchedRoomIds = matchedRoomIds ? intersect(matchedRoomIds, matches.roomIds) : matches.roomIds;
    }
    return matchedRoomIds ? roomsWithAncestors(data.rooms, matchedRoomIds) : undefined;
  }, [data, roomQuery, filterMode, matches]);

  const visibleRooms = useMemo(
    () => computeVisibleRooms(allRooms, collapsed, roomKeep),
    [allRooms, collapsed, roomKeep],
  );

  const templates = useMemo(() => data?.templates ?? [], [data]);

  // Столбцы: сортировка → поиск по имени → фильтр-скрытие по значению.
  const displayedTemplates = useMemo(() => {
    let list = sortTemplates(templates, sortKey, sortDir);
    if (templateQuery.trim()) list = list.filter((t) => nameMatches(t.name, templateQuery));
    if (filterMode && matches) list = list.filter((t) => matches.templateIds.has(t.id));
    return list;
  }, [templates, sortKey, sortDir, templateQuery, filterMode, matches]);

  const toggle = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isEmpty = !loading && !error && allRooms.length === 0 && templates.length === 0;

  return (
    <div className="app">
      <header className="app-top">
        <h1>Матрица доступа PERCo</h1>
        <RefreshBar
          meta={data?.meta ?? null}
          status={refresh.status}
          busy={refresh.busy}
          error={refresh.error}
          onRefresh={refresh.trigger}
        />
      </header>

      <div className="app-toolbar">
        <SearchSortBar
          templateQuery={templateQuery}
          roomQuery={roomQuery}
          sortKey={sortKey}
          sortDir={sortDir}
          onTemplateQuery={setTemplateQuery}
          onRoomQuery={setRoomQuery}
          onSort={(key, dir) => {
            setSortKey(key);
            setSortDir(dir);
          }}
        />
      </div>

      <div className="app-toolbar">
        <FilterPanel
          filter={filter}
          schedules={schedules}
          matched={matches ? { templates: matches.templateIds.size, rooms: matches.roomIds.size } : null}
          onChange={setFilter}
        />
        {data && (
          <span className="app-counts">
            показано: шаблонов {displayedTemplates.length} / {templates.length}, помещений{" "}
            {visibleRooms.length} / {allRooms.length}
          </span>
        )}
      </div>

      <div className="app-grid">
        {error && <div className="app-msg error">Ошибка загрузки: {error}</div>}
        {isEmpty && !refresh.busy && (
          <div className="app-msg">
            Кэш пуст. Нажмите «Обновить всё», чтобы загрузить данные из PERCo.
          </div>
        )}
        {!error && data && (allRooms.length > 0 || templates.length > 0) && (
          <MatrixGrid
            rooms={visibleRooms}
            templates={displayedTemplates}
            cellIndex={cellIndex}
            collapsed={collapsed}
            highlightedTemplates={highlightMode && matches ? matches.templateIds : undefined}
            highlightedRooms={highlightMode && matches ? matches.roomIds : undefined}
            onToggle={toggle}
            onHover={setHover}
          />
        )}
      </div>

      <footer className="app-info">
        {hover ? (
          <>
            <b>{hover.template.name}</b> × <b>{hover.room.name || `#${hover.room.roomId}`}</b>
            {hover.cell ? (
              <>
                {" → "}график: {hover.cell.scheduleName} ({hover.cell.scheduleTypeName})
                {hover.cell.isGuard && "; охрана"}
                {hover.cell.isAntipass && "; antipass"}
              </>
            ) : (
              " → доступа нет"
            )}
          </>
        ) : (
          <span className="muted">Наведите курсор на ячейку для подробностей</span>
        )}
      </footer>
    </div>
  );
}
