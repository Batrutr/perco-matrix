import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatrixResponse, Template } from "@perco/shared";
import { fetchConfig, fetchMatrix } from "./api/client.js";
import { useRefresh } from "./hooks/useRefresh.js";
import {
    annotateRooms,
    buildCellIndex,
    computeVisibleRooms,
    sortRoomsTree,
    type RoomSortKey,
} from "./matrix/model.js";
import { ANY_SPEC, findFullMatches, greedySetCover, specLabel, type CellSpec } from "./matrix/finder.js";
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
    combineHidden,
    roomIdsWithAccessInTemplate,
    roomsVisibleAfterHiding,
    templateIdsWithAccessInRoom,
    type CombineMode,
    type HideFlags,
} from "./matrix/hide.js";
import { MatrixGrid, type HoverInfo } from "./matrix/MatrixGrid.js";
import { RefreshBar } from "./components/RefreshBar.js";
import { FilterPanel } from "./components/FilterPanel.js";
import { SearchSortBar } from "./components/SearchSortBar.js";
import { ContextMenu, type MenuItem } from "./components/ContextMenu.js";
import { FinderPanel } from "./components/FinderPanel.js";
import { SpecEditor } from "./components/SpecEditor.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
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
    // Сортировка помещений с сохранением дерева: "tree" = исходный порядок PERCo.
    const [roomSortKey, setRoomSortKey] = useState<RoomSortKey>("tree");
    const [roomSortDir, setRoomSortDir] = useState<SortDir>("asc");
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
    // Как комбинировать скрытия от нескольких источников: "all" = пересечение видимого
    // (по всем; как было), "any" = объединение (хотя бы по одному).
    const [hideCombine, setHideCombine] = useState<CombineMode>("all");
    const [pinnedTemplateIds, setPinnedTemplateIds] = useState<number[]>([]);
    const [importantTemplates, setImportantTemplates] = useState<string[]>([]);
    // Аббревиатуры графиков (имя → буква) из конфига; пусто = первая буква имени.
    const [scheduleAbbr, setScheduleAbbr] = useState<Record<string, string>>({});
    const [menu, setMenu] = useState<Menu | null>(null);
    // Режим подбора шаблона: требование (roomId → отметки) + позиция редактора отметок.
    const [finder, setFinder] = useState(false);
    const [requirement, setRequirement] = useState<ReadonlyMap<number, CellSpec>>(new Map());
    const [specEditor, setSpecEditor] = useState<{ roomId: number; x: number; y: number } | null>(null);

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

    // Конфиг сервера (грузим один раз; при сбое — пустые значения)
    useEffect(() => {
        fetchConfig()
            .then((c) => {
                setImportantTemplates(c.importantTemplates);
                setScheduleAbbr(c.scheduleAbbr);
            })
            .catch(() => {
                setImportantTemplates([]);
                setScheduleAbbr({});
            });
    }, []);

    const refresh = useRefresh(load);

    const allRooms = useMemo(() => (data ? annotateRooms(data.rooms) : []), [data]);
    // Помещения в выбранном порядке (по дереву или по имени, иерархия сохраняется).
    const sortedRooms = useMemo(
        () => sortRoomsTree(allRooms, roomSortKey, roomSortDir),
        [allRooms, roomSortKey, roomSortDir],
    );
    const cellIndex = useMemo(() => buildCellIndex(data?.cells ?? []), [data]);
    const schedules = useMemo(() => uniqueSchedules(data?.cells ?? []), [data]);

    const matches = useMemo(
        () => (filter.active && data ? computeMatches(data.cells, filter) : null),
        [filter, data],
    );

    const filterMode = filter.active && filter.mode === "filter";
    const highlightMode = filter.active && filter.mode === "highlight";

    // Скрытые элементы — производные от карт скрытия. Каждый источник даёт свой набор
    // скрытого; наборы сводятся режимом hideCombine (пересечение/объединение видимого).
    const hiddenRoomIds = useMemo(() => {
        if (!data || roomHidesByTemplate.size === 0) return new Set<number>();
        const sets: Set<number>[] = [];
        for (const [templateId, flags] of roomHidesByTemplate) {
            const access = roomIdsWithAccessInTemplate(data.cells, templateId);
            const s = new Set<number>();
            for (const r of data.rooms) {
                const has = access.has(r.roomId);
                if ((flags.noAccess && !has) || (flags.withAccess && has)) s.add(r.roomId);
            }
            sets.push(s);
        }
        return combineHidden(sets, hideCombine);
    }, [data, roomHidesByTemplate, hideCombine]);

    const hiddenTemplateIds = useMemo(() => {
        if (!data || templateHidesByRoom.size === 0) return new Set<number>();
        const sets: Set<number>[] = [];
        for (const [roomId, flags] of templateHidesByRoom) {
            const access = templateIdsWithAccessInRoom(data.cells, roomId);
            const s = new Set<number>();
            for (const t of data.templates) {
                const has = access.has(t.id);
                if ((flags.noAccess && !has) || (flags.withAccess && has)) s.add(t.id);
            }
            sets.push(s);
        }
        return combineHidden(sets, hideCombine);
    }, [data, templateHidesByRoom, hideCombine]);

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
        () => computeVisibleRooms(sortedRooms, collapsed, finalRoomKeep),
        [sortedRooms, collapsed, finalRoomKeep],
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

    const toggle = useCallback((id: number) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Быстрое сворачивание дерева. level — сколько уровней показать (1 = только верхний):
    // сворачиваем все узлы с детьми на глубине >= level-1, deeper скрываются.
    const maxTreeDepth = useMemo(
        () => allRooms.reduce((m, r) => Math.max(m, r.depth), 0),
        [allRooms],
    );
    const collapseToLevel = useCallback(
        (level: number) => {
            const maxVisibleDepth = Math.max(0, level - 1);
            const next = new Set<number>();
            for (const r of allRooms) if (r.hasChildren && r.depth >= maxVisibleDepth) next.add(r.id);
            setCollapsed(next);
        },
        [allRooms],
    );
    const expandAll = useCallback(() => setCollapsed(new Set()), []);

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

    // --- Режим подбора шаблона ---
    const scheduleNameById = useMemo(
        () => new Map(schedules.map((s) => [s.id, s.name])),
        [schedules],
    );
    const roomNameById = useMemo(
        () => new Map(allRooms.map((r) => [r.roomId, r.name || `#${r.roomId}`])),
        [allRooms],
    );
    const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

    // Подписи чернового столбца «Требование»
    const draftCells = useMemo(() => {
        const m = new Map<number, string>();
        for (const [roomId, spec] of requirement) m.set(roomId, specLabel(spec, scheduleNameById, scheduleAbbr));
        return m;
    }, [requirement, scheduleNameById, scheduleAbbr]);

    // Результат подбора: полные совпадения, иначе жадная комбинация
    const finderResult = useMemo(() => {
        if (!finder || requirement.size === 0) return null;
        const fullIds = findFullMatches(templates, cellIndex, requirement);
        if (fullIds.length > 0) return { fullIds, combination: null };
        return { fullIds, combination: greedySetCover(templates, cellIndex, requirement) };
    }, [finder, requirement, templates, cellIndex]);

    const fullMatchTemplates = useMemo(
        () => (finderResult?.fullIds ?? []).map((id) => templateById.get(id)).filter((t): t is Template => Boolean(t)),
        [finderResult, templateById],
    );
    const combinationDisplay = useMemo(() => {
        const combo = finderResult?.combination;
        if (!combo) return null;
        return combo.chosen
            .map((c) => {
                const template = templateById.get(c.templateId);
                return template ? { template, covers: c.covers } : null;
            })
            .filter((x): x is { template: Template; covers: number[] } => Boolean(x));
    }, [finderResult, templateById]);
    const uncoveredNames = useMemo(
        () => (finderResult?.combination?.uncovered ?? []).map((rid) => roomNameById.get(rid) ?? `#${rid}`),
        [finderResult, roomNameById],
    );
    // Множество подходящих шаблонов (полные совпадения или участники комбинации)
    const finderMatchIds = useMemo(() => {
        if (!finderResult) return undefined;
        const ids = finderResult.fullIds.length
            ? finderResult.fullIds
            : (finderResult.combination?.chosen ?? []).map((c) => c.templateId);
        return new Set(ids);
    }, [finderResult]);

    // В режиме подбора показываем ТОЛЬКО подходящие шаблоны (неподходящие скрыты).
    // Пока требование пусто (finderMatchIds undefined) — показываем все.
    const gridPinned = useMemo(
        () => (finder && finderMatchIds ? pinnedTemplates.filter((t) => finderMatchIds.has(t.id)) : pinnedTemplates),
        [finder, finderMatchIds, pinnedTemplates],
    );
    const gridScroll = useMemo(
        () => (finder && finderMatchIds ? scrollTemplates.filter((t) => finderMatchIds.has(t.id)) : scrollTemplates),
        [finder, finderMatchIds, scrollTemplates],
    );

    // После обновления данных выбрасываем из требования (и из редактора) помещения,
    // которых больше нет: иначе полное совпадение навсегда недостижимо, а убрать
    // такую запись поштучно нельзя — её ячейка чернового столбца исчезла.
    useEffect(() => {
        if (!data) return;
        const ids = new Set(data.rooms.map((r) => r.roomId));
        setRequirement((prev) => {
            if (![...prev.keys()].some((id) => !ids.has(id))) return prev;
            const next = new Map<number, CellSpec>();
            for (const [roomId, spec] of prev) if (ids.has(roomId)) next.set(roomId, spec);
            return next;
        });
        setSpecEditor((prev) => (prev && !ids.has(prev.roomId) ? null : prev));
    }, [data]);

    const handleDraftCell = useCallback((roomId: number, x: number, y: number) => {
        setRequirement((prev) => (prev.has(roomId) ? prev : new Map(prev).set(roomId, ANY_SPEC)));
        setSpecEditor({ roomId, x, y });
    }, []);
    const updateSpec = useCallback((roomId: number, spec: CellSpec) => {
        setRequirement((prev) => new Map(prev).set(roomId, spec));
    }, []);
    const removeSpec = useCallback((roomId: number) => {
        setRequirement((prev) => {
            const n = new Map(prev);
            n.delete(roomId);
            return n;
        });
        setSpecEditor(null);
    }, []);

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
                <div className="app-brand">
                    <img className="app-logo" src="/favicon.svg" alt="" width={28} height={28} />
                    <h1>
                        Матрица доступа <span className="app-brand-accent">PERCo</span>
                    </h1>
                </div>
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
                    roomSortKey={roomSortKey}
                    roomSortDir={roomSortDir}
                    onTemplateQuery={setTemplateQuery}
                    onRoomQuery={setRoomQuery}
                    onSort={(key, dir) => {
                        setSortKey(key);
                        setSortDir(dir);
                    }}
                    onRoomSort={(key, dir) => {
                        setRoomSortKey(key);
                        setRoomSortDir(dir);
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
                    <button
                        className={finder ? "finder-toggle on" : "finder-toggle"}
                        onClick={() => {
                            setFinder((f) => !f);
                            setSpecEditor(null);
                        }}
                        title="Подбор шаблона по нужным отметкам в выбранных помещениях"
                    >
                        {finder ? "✕ Подбор" : "🔍 Подбор шаблона"}
                    </button>
                    <ThemeToggle />
                </div>
            </div>

            {finder && (
                <div className="app-toolbar">
                    <FinderPanel
                        selectedCount={requirement.size}
                        fullMatches={fullMatchTemplates}
                        combination={combinationDisplay}
                        uncoveredNames={uncoveredNames}
                        onPick={togglePin}
                        onClear={() => {
                            setRequirement(new Map());
                            setSpecEditor(null);
                        }}
                        onExit={() => {
                            setFinder(false);
                            setSpecEditor(null);
                        }}
                    />
                </div>
            )}

            <div className="app-toolbar">
                <FilterPanel
                    filter={filter}
                    schedules={schedules}
                    matched={matches ? { templates: matches.templateIds.size, rooms: matches.roomIds.size } : null}
                    onChange={setFilter}
                />
                <div className="toolbar-right">
                    {data && allRooms.length > 0 && (
                        <div className="tree-controls">
                            <span className="tree-controls-label">Дерево:</span>
                            <button onClick={() => collapseToLevel(1)} title="Свернуть всё (только верхний уровень)">
                                свернуть всё
                            </button>
                            {Array.from({ length: Math.max(0, maxTreeDepth - 1) }, (_, i) => i + 2).map((lvl) => (
                                <button key={lvl} onClick={() => collapseToLevel(lvl)} title={`Показать дерево до ${lvl} уровней`}>
                                    до ур. {lvl}
                                </button>
                            ))}
                            <button onClick={expandAll} title="Развернуть всё">
                                развернуть всё
                            </button>
                        </div>
                    )}
                    {(roomHidesByTemplate.size >= 2 || templateHidesByRoom.size >= 2) && (
                        <span className="combine-toggle" title="Как комбинировать несколько скрытий">
                            совмещать:
                            <button
                                className={hideCombine === "all" ? "on" : ""}
                                onClick={() => setHideCombine("all")}
                                title="Видно то, что прошло ВСЕ скрытия (пересечение)"
                            >
                                ∩ во всех
                            </button>
                            <button
                                className={hideCombine === "any" ? "on" : ""}
                                onClick={() => setHideCombine("any")}
                                title="Видно то, что прошло хотя бы одно скрытие (объединение)"
                            >
                                ∪ в любом
                            </button>
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
                    {data && (
                        <span className="app-counts">
                            показано: шаблонов {gridScroll.length + gridPinned.length} / {templates.length},
                            помещений {visibleRooms.length} / {allRooms.length}
                        </span>
                    )}
                </div>
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
                        templates={gridScroll}
                        pinnedTemplates={gridPinned}
                        cellIndex={cellIndex}
                        collapsed={collapsed}
                        highlightedTemplates={finder ? undefined : highlightMode && matches ? matches.templateIds : undefined}
                        highlightedRooms={highlightMode && matches ? matches.roomIds : undefined}
                        markedTemplates={roomHidesByTemplate}
                        markedRooms={templateHidesByRoom}
                        onToggle={toggle}
                        onHover={setHover}
                        onTemplateContext={(id, x, y) => setMenu({ kind: "template", id, x, y })}
                        onRoomContext={(id, x, y) => setMenu({ kind: "room", id, x, y })}
                        draftActive={finder}
                        draftCells={draftCells}
                        onDraftCell={handleDraftCell}
                        scheduleAbbr={scheduleAbbr}
                    />
                )}
            </div>

            {menu && (
                <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
            )}

            {finder && specEditor && (
                <SpecEditor
                    x={specEditor.x}
                    y={specEditor.y}
                    roomName={roomNameById.get(specEditor.roomId) ?? `#${specEditor.roomId}`}
                    spec={requirement.get(specEditor.roomId) ?? ANY_SPEC}
                    schedules={schedules}
                    onChange={(s) => updateSpec(specEditor.roomId, s)}
                    onRemove={() => removeSpec(specEditor.roomId)}
                    onClose={() => setSpecEditor(null)}
                />
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
