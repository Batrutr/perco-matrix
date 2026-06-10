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
import {
  roomIdsWithAccessInTemplate,
  roomsVisibleAfterHiding,
  templateIdsWithAccessInRoom,
} from "./matrix/hide.js";
import { MatrixGrid, type HoverInfo } from "./matrix/MatrixGrid.js";
import { RefreshBar } from "./components/RefreshBar.js";
import { FilterPanel } from "./components/FilterPanel.js";
import { SearchSortBar } from "./components/SearchSortBar.js";
import { ContextMenu, type MenuItem } from "./components/ContextMenu.js";
import "./App.css";

type Menu = { kind: "template" | "room"; id: number; x: number; y: number };

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
  const [hiddenRoomIds, setHiddenRoomIds] = useState<ReadonlySet<number>>(new Set());
  const [hiddenTemplateIds, setHiddenTemplateIds] = useState<ReadonlySet<number>>(new Set());
  // «Источники» скрытия — для пометки в сетке (через какой шаблон/помещение что-то скрыто)
  const [templatesDrivingHide, setTemplatesDrivingHide] = useState<ReadonlySet<number>>(new Set());
  const [roomsDrivingHide, setRoomsDrivingHide] = useState<ReadonlySet<number>>(new Set());
  const [menu, setMenu] = useState<Menu | null>(null);

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

  // Скрытие строк контекстным меню (по критериям). Видны помещения, у которых в
  // поддереве осталась хотя бы одна нескрытая строка (предки сохраняются).
  const contextRoomKeep = useMemo(
    () => (data && hiddenRoomIds.size ? roomsVisibleAfterHiding(data.rooms, hiddenRoomIds) : undefined),
    [data, hiddenRoomIds],
  );
  const finalRoomKeep = useMemo(() => {
    if (roomKeep && contextRoomKeep) return intersect(roomKeep, contextRoomKeep);
    return roomKeep ?? contextRoomKeep;
  }, [roomKeep, contextRoomKeep]);

  const visibleRooms = useMemo(
    () => computeVisibleRooms(allRooms, collapsed, finalRoomKeep),
    [allRooms, collapsed, finalRoomKeep],
  );

  const templates = useMemo(() => data?.templates ?? [], [data]);

  // Столбцы: сортировка → поиск по имени → фильтр по значению → скрытие меню.
  const displayedTemplates = useMemo(() => {
    let list = sortTemplates(templates, sortKey, sortDir);
    if (templateQuery.trim()) list = list.filter((t) => nameMatches(t.name, templateQuery));
    if (filterMode && matches) list = list.filter((t) => matches.templateIds.has(t.id));
    if (hiddenTemplateIds.size) list = list.filter((t) => !hiddenTemplateIds.has(t.id));
    return list;
  }, [templates, sortKey, sortDir, templateQuery, filterMode, matches, hiddenTemplateIds]);

  const toggle = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Скрыть/показать помещения по доступу в шаблоне.
  // withAccess: false → без доступа, true → с доступом; hide: добавить/убрать из скрытых.
  const setRoomsHiddenForTemplate = useCallback(
    (templateId: number, withAccess: boolean, hide: boolean) => {
      if (!data) return;
      const access = roomIdsWithAccessInTemplate(data.cells, templateId);
      setHiddenRoomIds((prev) => {
        const next = new Set(prev);
        for (const r of data.rooms) {
          if (access.has(r.roomId) !== withAccess) continue;
          if (hide) next.add(r.roomId);
          else next.delete(r.roomId);
        }
        return next;
      });
      // пометка: через этот шаблон что-то скрыто (снимается при «Показать» через него)
      setTemplatesDrivingHide((prev) => {
        const next = new Set(prev);
        if (hide) next.add(templateId);
        else next.delete(templateId);
        return next;
      });
    },
    [data],
  );

  // Скрыть/показать шаблоны по доступу в помещение.
  const setTemplatesHiddenForRoom = useCallback(
    (roomId: number, withAccess: boolean, hide: boolean) => {
      if (!data) return;
      const access = templateIdsWithAccessInRoom(data.cells, roomId);
      setHiddenTemplateIds((prev) => {
        const next = new Set(prev);
        for (const t of data.templates) {
          if (access.has(t.id) !== withAccess) continue;
          if (hide) next.add(t.id);
          else next.delete(t.id);
        }
        return next;
      });
      setRoomsDrivingHide((prev) => {
        const next = new Set(prev);
        if (hide) next.add(roomId);
        else next.delete(roomId);
        return next;
      });
    },
    [data],
  );

  const clearHidden = useCallback(() => {
    setHiddenRoomIds(new Set());
    setHiddenTemplateIds(new Set());
    setTemplatesDrivingHide(new Set());
    setRoomsDrivingHide(new Set());
  }, []);

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return [];
    if (menu.kind === "template") {
      return [
        { label: "Скрыть помещения без доступа в этом шаблоне", onClick: () => setRoomsHiddenForTemplate(menu.id, false, true) },
        { label: "Скрыть помещения с доступом в этом шаблоне", onClick: () => setRoomsHiddenForTemplate(menu.id, true, true) },
        { label: "Показать помещения без доступа в этом шаблоне", divider: true, onClick: () => setRoomsHiddenForTemplate(menu.id, false, false) },
        { label: "Показать помещения с доступом в этом шаблоне", onClick: () => setRoomsHiddenForTemplate(menu.id, true, false) },
      ];
    }
    return [
      { label: "Скрыть шаблоны без доступа в это помещение", onClick: () => setTemplatesHiddenForRoom(menu.id, false, true) },
      { label: "Скрыть шаблоны с доступом в это помещение", onClick: () => setTemplatesHiddenForRoom(menu.id, true, true) },
      { label: "Показать шаблоны без доступа в это помещение", divider: true, onClick: () => setTemplatesHiddenForRoom(menu.id, false, false) },
      { label: "Показать шаблоны с доступом в это помещение", onClick: () => setTemplatesHiddenForRoom(menu.id, true, false) },
    ];
  }, [menu, setRoomsHiddenForTemplate, setTemplatesHiddenForRoom]);

  const hasHidden = hiddenRoomIds.size > 0 || hiddenTemplateIds.size > 0;
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
        {hasHidden && (
          <button
            className="show-hidden"
            onClick={clearHidden}
            title="Показать разом всё, что было скрыто через контекстное меню"
          >
            Показать всё скрытое
          </button>
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
            markedTemplates={templatesDrivingHide}
            markedRooms={roomsDrivingHide}
            onToggle={toggle}
            onHover={setHover}
            onTemplateContext={(id, x, y) => setMenu({ kind: "template", id, x, y })}
            onRoomContext={(id, x, y) => setMenu({ kind: "room", id, x, y })}
          />
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}

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
