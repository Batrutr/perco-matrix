// Виртуализированная сетка матрицы: строки (помещения) и столбцы (шаблоны).
// Шапка и первый столбец зафиксированы (sticky). Закреплённые шаблоны — это
// дополнительные sticky-столбцы слева (не прокручиваются по горизонтали).
//
// Перф: ячейки и заголовки — React.memo с примитивными/стабильными пропсами.
// При наведении меняется только isHot затронутых столбцов, поэтому перерисовываются
// лишь они, а не вся видимая сетка. Подсветка СТРОКИ — чистым CSS (.mx-row.hot),
// без участия пропа ячейки, поэтому движение вдоль столбца не трогает ячейки.
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { MatrixCell, Template } from "@perco/shared";
import { cellKey, cellText, describeCell, type RoomRow } from "./model.js";
import type { HideFlags } from "./hide.js";
import { GRID_SIZES, type GridSizes } from "../hooks/useGridSize.js";
import "./matrix.css";

/** Значки активного скрытия: ● — скрыто «с доступом», ○ — скрыто «без доступа». */
function hideMarks(f: HideFlags, noun: string) {
    return (
        <span className="mx-hidemarks">
            {f.withAccess && (
                <span className="mx-hidemark" title={`Скрыты ${noun} с доступом`}>
                    ●
                </span>
            )}
            {f.noAccess && (
                <span className="mx-hidemark" title={`Скрыты ${noun} без доступа`}>
                    ○
                </span>
            )}
        </span>
    );
}

export interface HoverInfo {
    template: Template;
    room: RoomRow;
    cell: MatrixCell | undefined;
}

// --- Мемоизированные ячейка и заголовок столбца ---

interface HeaderCellProps {
    template: Template;
    left: number;
    colW: number;
    headerH: number;
    pinned: boolean;
    isHot: boolean;
    isDim: boolean;
    mark: HideFlags | undefined;
    onContext: (templateId: number, x: number, y: number) => void;
}

const HeaderCell = memo(function HeaderCell({
    template: t,
    left,
    colW,
    headerH,
    pinned,
    isHot,
    isDim,
    mark,
    onContext,
}: HeaderCellProps) {
    const style: CSSProperties = pinned
        ? { position: "sticky", left, width: colW, height: headerH, zIndex: 5 }
        : { position: "absolute", left, width: colW, height: headerH };
    return (
        <div
            className={`mx-th${pinned ? " pinned" : ""}${isHot ? " hot" : ""}${isDim ? " dim" : ""}${mark ? " marked" : ""}`}
            style={style}
            title={t.comment ? `${t.name} — ${t.comment}` : t.name}
            onContextMenu={(e) => {
                e.preventDefault();
                onContext(t.id, e.clientX, e.clientY);
            }}
        >
            {pinned && (
                <span className="mx-pinmark" title="Закреплён (ПКМ → Открепить)">
                    📌
                </span>
            )}
            {mark && hideMarks(mark, "помещения")}
            <span className="mx-th-text">{t.name}</span>
            <span className="mx-th-counts">
                <span className="c-rooms" title={`Помещений: ${t.roomCount}`}>
                    {t.roomCount}
                </span>
                <span className="c-emp" title="Сотрудников">
                    {t.employeeCount ?? "–"}
                </span>
            </span>
        </div>
    );
});

interface BodyCellProps {
    template: Template;
    room: RoomRow;
    cell: MatrixCell | undefined;
    left: number;
    colW: number;
    rowH: number;
    pinned: boolean;
    isHot: boolean; // подсветка по столбцу (строка — через CSS .mx-row.hot)
    abbr: Record<string, string>; // таблица аббревиатур графиков (из конфига)
    onEnter: (room: RoomRow, template: Template, cell: MatrixCell | undefined) => void;
}

const BodyCell = memo(function BodyCell({
    template,
    room,
    cell,
    left,
    colW,
    rowH,
    pinned,
    isHot,
    abbr,
    onEnter,
}: BodyCellProps) {
    const style: CSSProperties = pinned
        ? { position: "sticky", left, width: colW, height: rowH, zIndex: 1 }
        : { position: "absolute", left, width: colW, height: rowH };
    return (
        <div
            className={`mx-cell${pinned ? " pinned" : ""}${cell ? " filled" : ""}${isHot ? " hot" : ""}`}
            style={style}
            title={cell ? describeCell(cell, template, room) : ""}
            onMouseEnter={() => onEnter(room, template, cell)}
        >
            {cell ? (
                <>
                    <span className="mx-cell-text">{cellText(cell, abbr)}</span>
                    {(cell.isGuard || cell.isAntipass) && (
                        <span className="mx-badges">
                            {cell.isGuard && <i className="mx-badge g" title="Охрана" />}
                            {cell.isAntipass && <i className="mx-badge a" title="Antipass" />}
                        </span>
                    )}
                </>
            ) : null}
        </div>
    );
});

interface Props {
    rooms: RoomRow[]; // уже видимые (с учётом сворачивания)
    templates: Template[]; // прокручиваемые столбцы (без закреплённых)
    pinnedTemplates?: Template[]; // закреплённые слева
    cellIndex: Map<string, MatrixCell>;
    collapsed: ReadonlySet<number>;
    highlightedTemplates?: ReadonlySet<number>;
    highlightedRooms?: ReadonlySet<number>;
    /** Шаблон → какие помещения скрыты через него (метки в шапке) */
    markedTemplates?: ReadonlyMap<number, HideFlags>;
    /** Помещение → какие шаблоны скрыты через него (метки у ярлыка) */
    markedRooms?: ReadonlyMap<number, HideFlags>;
    onToggle: (roomId: number) => void;
    onHover?: (info: HoverInfo | null) => void;
    onTemplateContext?: (templateId: number, x: number, y: number) => void;
    onRoomContext?: (roomId: number, x: number, y: number) => void;
    /** Режим подбора: показать черновой столбец «Требование» слева */
    draftActive?: boolean;
    /** roomId → короткая подпись отметок в черновом столбце (наличие = помещение выбрано) */
    draftCells?: ReadonlyMap<number, string>;
    /** Клик по ячейке чернового столбца (добавить/изменить отметки) */
    onDraftCell?: (roomId: number, x: number, y: number) => void;
    /** Таблица аббревиатур графиков (имя → буква) из конфига сервера */
    scheduleAbbr?: Record<string, string>;
    /** Геометрия сетки (пресет масштаба); по умолчанию «обычно» */
    sizes?: GridSizes;
    /** Подсказка легенды угла: расшифровка букв графиков и значков */
    legendTitle?: string;
}

export function MatrixGrid({
    rooms,
    templates,
    pinnedTemplates = [],
    cellIndex,
    collapsed,
    highlightedTemplates,
    highlightedRooms,
    markedTemplates,
    markedRooms,
    onToggle,
    onHover,
    onTemplateContext,
    onRoomContext,
    draftActive = false,
    draftCells,
    onDraftCell,
    scheduleAbbr = {},
    sizes = GRID_SIZES.normal,
    legendTitle,
}: Props) {
    const { rowH, headerH, labelW, colW } = sizes;
    const parentRef = useRef<HTMLDivElement>(null);
    // Наведение храним по стабильным id (roomId/templateId), а не по индексу строки —
    // иначе подсветка «съезжает» при смене состава строк (сворачивание/фильтр/скрытие).
    const [hover, setHover] = useState<{ roomId: number; templateId: number } | null>(null);

    const rowV = useVirtualizer({
        count: rooms.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowH,
        overscan: 10,
    });
    const colV = useVirtualizer({
        horizontal: true,
        count: templates.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => colW,
        overscan: 4,
    });
    // Виртуализатор кэширует размеры — при смене пресета пересчитываем разметку.
    useEffect(() => {
        rowV.measure();
        colV.measure();
    }, [rowH, colW, rowV, colV]);

    const rowItems = rowV.getVirtualItems();
    const colItems = colV.getVirtualItems();
    const draftW = draftActive ? colW : 0;
    const pinnedW = pinnedTemplates.length * colW;
    const baseLeft = labelW + draftW; // сдвиг столбцов на черновой столбец
    const contentW = baseLeft + pinnedW + colV.getTotalSize();

    // Стабильные колбэки — чтобы memo-пропсы ячеек не менялись на каждый рендер.
    const handleEnter = useCallback(
        (room: RoomRow, template: Template, cell: MatrixCell | undefined) => {
            setHover({ roomId: room.roomId, templateId: template.id });
            onHover?.({ template, room, cell });
        },
        [onHover],
    );
    const handleLeave = useCallback(() => {
        setHover(null);
        onHover?.(null);
    }, [onHover]);
    const handleHeaderContext = useCallback(
        (templateId: number, x: number, y: number) => onTemplateContext?.(templateId, x, y),
        [onTemplateContext],
    );

    const hotTemplateId = hover?.templateId ?? null;

    const renderHeader = (t: Template, left: number, pinned: boolean) => (
        <HeaderCell
            key={pinned ? `p${t.id}` : t.id}
            template={t}
            left={left}
            colW={colW}
            headerH={headerH}
            pinned={pinned}
            isHot={hotTemplateId === t.id}
            isDim={!!(highlightedTemplates && !highlightedTemplates.has(t.id))}
            mark={markedTemplates?.get(t.id)}
            onContext={handleHeaderContext}
        />
    );

    const renderCell = (t: Template, r: RoomRow, left: number, pinned: boolean) => (
        <BodyCell
            key={pinned ? `p${t.id}` : t.id}
            template={t}
            room={r}
            cell={cellIndex.get(cellKey(t.id, r.roomId))}
            left={left}
            colW={colW}
            rowH={rowH}
            pinned={pinned}
            isHot={hotTemplateId === t.id}
            abbr={scheduleAbbr}
            onEnter={handleEnter}
        />
    );

    return (
        <div ref={parentRef} className="mx-scroll" onMouseLeave={handleLeave}>
            {/* Шапка */}
            <div className="mx-header" style={{ width: contentW, height: headerH }}>
                <div className="mx-corner" style={{ width: labelW, height: headerH }}>
                    <span className="mx-corner-title">
                        Помещения <span className="mx-corner-sep">\</span> Шаблоны
                    </span>
                    {/* Легенда содержимого ячейки: буква графика + значки охраны/antipass.
                        Полная расшифровка букв (по реальным графикам) — в подсказке. */}
                    <span className="mx-corner-badges" title={legendTitle}>
                        <span className="mx-corner-badges-hint">буква — график</span> ·{" "}
                        <span className="mx-corner-badges-item">
                            <i className="mx-badge g" /> охрана
                        </span>{" "}
                        ·{" "}
                        <span className="mx-corner-badges-item">
                            <i className="mx-badge a" /> antipass
                        </span>
                    </span>
                    <span className="mx-corner-legend">
                        <span className="c-rooms">помещений</span>
                        <span className="c-emp">сотрудников</span>
                    </span>
                </div>
                {draftActive && (
                    <div
                        className="mx-th draft"
                        style={{ position: "sticky", left: labelW, width: colW, height: headerH, zIndex: 5 }}
                        title="Требование: задайте отметки по выбранным помещениям"
                    >
                        <span className="mx-th-text">Требование</span>
                    </div>
                )}
                {pinnedTemplates.map((t, i) => renderHeader(t, baseLeft + i * colW, true))}
                {colItems.map((col) => renderHeader(templates[col.index]!, baseLeft + pinnedW + col.start, false))}
            </div>

            {/* Тело */}
            <div className="mx-body" style={{ width: contentW, height: rowV.getTotalSize() }}>
                {rowItems.map((row) => {
                    const r = rooms[row.index]!;
                    const rowHot = hover?.roomId === r.roomId;
                    const rowDim = highlightedRooms && !highlightedRooms.has(r.roomId);
                    const rowMark = markedRooms?.get(r.roomId);
                    return (
                        <div
                            key={row.key}
                            className={`mx-row${rowHot ? " hot" : ""}${rowDim ? " dim" : ""}`}
                            style={{ top: row.start, height: rowH, width: contentW }}
                        >
                            <div
                                className={`mx-label${r.hasChildren ? " clickable" : " leaf"}${rowMark ? " marked" : ""}`}
                                style={{ width: labelW, height: rowH }}
                                onClick={() => r.hasChildren && onToggle(r.id)}
                                onContextMenu={
                                    onRoomContext
                                        ? (e) => {
                                            e.preventDefault();
                                            onRoomContext(r.roomId, e.clientX, e.clientY);
                                        }
                                        : undefined
                                }
                            >
                                {r.depth > 0 && (
                                    <span className="mx-guides">
                                        {Array.from({ length: r.depth }, (_, i) => (
                                            <span key={i} className="mx-guide" />
                                        ))}
                                    </span>
                                )}
                                {r.hasChildren ? (
                                    <span className="mx-caret">{collapsed.has(r.id) ? "+" : "−"}</span>
                                ) : (
                                    <span className="mx-caret leaf" />
                                )}
                                <span className="mx-name" title={r.name || `#${r.roomId}`}>
                                    {r.name || `#${r.roomId}`}
                                </span>
                                {rowMark && hideMarks(rowMark, "шаблоны")}
                            </div>
                            {draftActive && (
                                <div
                                    className={`mx-cell draft${draftCells?.has(r.roomId) ? " set" : ""}`}
                                    style={{ position: "sticky", left: labelW, width: colW, height: rowH, zIndex: 2 }}
                                    title="Клик — задать/изменить отметки требования для этого помещения"
                                    onClick={(e) => onDraftCell?.(r.roomId, e.clientX, e.clientY)}
                                >
                                    {draftCells?.has(r.roomId) ? (
                                        <span className="mx-cell-text">{draftCells.get(r.roomId)}</span>
                                    ) : (
                                        <span className="mx-draft-add">+</span>
                                    )}
                                </div>
                            )}
                            {pinnedTemplates.map((t, i) => renderCell(t, r, baseLeft + i * colW, true))}
                            {colItems.map((col) => renderCell(templates[col.index]!, r, baseLeft + pinnedW + col.start, false))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
