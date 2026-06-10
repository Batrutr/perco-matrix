import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatrixResponse, Template } from "@perco/shared";
import { fetchConfig, fetchMatrix } from "./api/client.js";
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
  resolveTemplateIds,
  roomIdsMatchingName,
  sortTemplates,
  type SortDir,
  type SortKey,
} from "./matrix/search.js";
import {
  roomIdsWithAccessInTemplate,
  roomsVisibleAfterHiding,
  templateIdsWithAccessInRoom,
  type HideFlags,
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
  // Скрытие задаётся покритериально и через источник:
  //  roomHidesByTemplate[templateId] = какие помещения скрыты через этот шаблон
  //  templateHidesByRoom[roomId]     = какие шаблоны скрыты через это помещение
  // Каждый критерий — независимый тумблер. Карта = и состояние, и пометка источника.
  const [roomHidesByTemplate, setRoomHidesByTemplate] = useState<ReadonlyMap<number, HideFlags>>(
    new Map(),
  );
  const [templateHidesByRoom, setTemplateHidesByRoom] = useState<ReadonlyMap<number, HideFlags>>(
    new Map(),
  );
  const [pinnedTemplateIds, setPinnedTemplateIds] = useState<number[]>([]);
  const [importantTemplates, setImportantTemplates] = useState<string[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);

  // Счётчик поколений: применяем результат только последнего запроса
  // (StrictMode-двойной вызов, повторные обновления, медленный старый ответ).
  const loadGen = useRef(0);
  const load = useCallback(() => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(null);
    fetchMatrix()
      .then((d) => {
        if (gen === loadGen.current) setData(d);
      })
      .catch((e: unknown) => {
        if (gen === loadGen.current) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (gen === loadGen.current) setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  // Конфиг «важных» шаблонов (грузим один раз; при сбое — пустой список)
  useEffect(() => {
    fetchConfig()
      .then((c) => setImportantTemplates(c.importantTemplates))
      .catch(() => setImportantTemplates([]));
  }, []);

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

  // Скрытые элементы — производные от карт скрытия (объединение по всем источникам/критериям).
  const hiddenRoomIds = useMemo(() => {
    const s = new Set<number>();
    if (!data) return s;
    for (const [templateId, flags] of roomHidesByTemplate) {
      const access = roomIdsWithAccessInTemplate(data.cells, templateId);
      for (const r of data.rooms) {
        const has = access.has(r.roomId);
        if ((flags.noAccess && !has) || (flags.withAccess && has)) s.add(r.roomId);
      }
    }
    return s;
  }, [data, roomHidesByTemplate]);

  const hiddenTemplateIds = useMemo(() => {
    const s = new Set<number>();
    if (!data) return s;
    for (const [roomId, flags] of templateHidesByRoom) {
      const access = templateIdsWithAccessInRoom(data.cells, roomId);
      for (const t of data.templates) {
        const has = access.has(t.id);
        if ((flags.noAccess && !has) || (flags.withAccess && has)) s.add(t.id);
      }
    }
    return s;
  }, [data, templateHidesByRoom]);

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

  // Закрепление: закреплённые шаблоны показываются слева (всегда видимы, не зависят
  // от сортировки/фильтра), остальные — прокручиваемые.
  const pinnedSet = useMemo(() => new Set(pinnedTemplateIds), [pinnedTemplateIds]);
  const pinnedTemplates = useMemo(
    () =>
      pinnedTemplateIds
        .map((id) => templates.find((t) => t.id === id))
        .filter((t): t is Template => Boolean(t)),
    [pinnedTemplateIds, templates],
  );
  const scrollTemplates = useMemo(
    () => displayedTemplates.filter((t) => !pinnedSet.has(t.id)),
    [displayedTemplates, pinnedSet],
  );
  const shownTemplateCount = scrollTemplates.length + pinnedTemplates.length;

  const toggle = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Тумблер скрытия помещений через шаблон по одному критерию (как закрепить/открепить).
  const toggleRoomHide = useCallback((templateId: number, criterion: keyof HideFlags) => {
    setRoomHidesByTemplate((prev) => {
      const next = new Map(prev);
      const cur = next.get(templateId) ?? { noAccess: false, withAccess: false };
      const updated = { ...cur, [criterion]: !cur[criterion] };
      if (!updated.noAccess && !updated.withAccess) next.delete(templateId);
      else next.set(templateId, updated);
      return next;
    });
  }, []);

  // Тумблер скрытия шаблонов через помещение по одному критерию.
  const toggleTemplateHide = useCallback((roomId: number, criterion: keyof HideFlags) => {
    setTemplateHidesByRoom((prev) => {
      const next = new Map(prev);
      const cur = next.get(roomId) ?? { noAccess: false, withAccess: false };
      const updated = { ...cur, [criterion]: !cur[criterion] };
      if (!updated.noAccess && !updated.withAccess) next.delete(roomId);
      else next.set(roomId, updated);
      return next;
    });
  }, []);

  const clearHidden = useCallback(() => {
    setRoomHidesByTemplate(new Map());
    setTemplateHidesByRoom(new Map());
  }, []);

  const togglePin = useCallback((id: number) => {
    setPinnedTemplateIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  // «Важные» шаблоны из конфига → их id (по id или имени) среди загруженных шаблонов
  const importantIds = useMemo(
    () => resolveTemplateIds(templates, importantTemplates),
    [templates, importantTemplates],
  );
  const pinImportant = useCallback(() => {
    setPinnedTemplateIds((prev) => [...prev, ...importantIds.filter((id) => !prev.includes(id))]);
  }, [importantIds]);
  const unpinAll = useCallback(() => setPinnedTemplateIds([]), []);

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return [];
    if (menu.kind === "template") {
      const f = roomHidesByTemplate.get(menu.id);
      return [
        { label: pinnedSet.has(menu.id) ? "Открепить" : "Закрепить слева", onClick: () => togglePin(menu.id) },
        {
          label: f?.noAccess
            ? "Показать помещения без доступа в этом шаблоне"
            : "Скрыть помещения без доступа в этом шаблоне",
          divider: true,
          onClick: () => toggleRoomHide(menu.id, "noAccess"),
        },
        {
          label: f?.withAccess
            ? "Показать помещения с доступом в этом шаблоне"
            : "Скрыть помещения с доступом в этом шаблоне",
          onClick: () => toggleRoomHide(menu.id, "withAccess"),
        },
      ];
    }
    const f = templateHidesByRoom.get(menu.id);
    return [
      {
        label: f?.noAccess
          ? "Показать шаблоны без доступа в это помещение"
          : "Скрыть шаблоны без доступа в это помещение",
        onClick: () => toggleTemplateHide(menu.id, "noAccess"),
      },
      {
        label: f?.withAccess
          ? "Показать шаблоны с доступом в это помещение"
          : "Скрыть шаблоны с доступом в это помещение",
        onClick: () => toggleTemplateHide(menu.id, "withAccess"),
      },
    ];
  }, [menu, pinnedSet, togglePin, toggleRoomHide, toggleTemplateHide, roomHidesByTemplate, templateHidesByRoom]);

  const hasHidden = roomHidesByTemplate.size > 0 || templateHidesByRoom.size > 0;
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
        <div className="pin-controls">
          {importantIds.length > 0 && (
            <button
              onClick={pinImportant}
              title="Закрепить слева все важные шаблоны из конфига"
            >
              📌 Закрепить важные ({importantIds.length})
            </button>
          )}
          {pinnedTemplateIds.length > 0 && (
            <button onClick={unpinAll} title="Открепить все закреплённые шаблоны">
              Открепить все ({pinnedTemplateIds.length})
            </button>
          )}
        </div>
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
            показано: шаблонов {shownTemplateCount} / {templates.length}, помещений{" "}
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
            templates={scrollTemplates}
            pinnedTemplates={pinnedTemplates}
            cellIndex={cellIndex}
            collapsed={collapsed}
            highlightedTemplates={highlightMode && matches ? matches.templateIds : undefined}
            highlightedRooms={highlightMode && matches ? matches.roomIds : undefined}
            markedTemplates={roomHidesByTemplate}
            markedRooms={templateHidesByRoom}
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
