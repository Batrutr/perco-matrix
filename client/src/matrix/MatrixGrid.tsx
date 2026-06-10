// Виртуализированная сетка матрицы: строки (помещения) и столбцы (шаблоны).
// Шапка и первый столбец зафиксированы (sticky). Закреплённые шаблоны — это
// дополнительные sticky-столбцы слева (не прокручиваются по горизонтали).
import { useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { MatrixCell, Template } from "@perco/shared";
import { cellKey, cellText, describeCell, type RoomRow } from "./model.js";
import type { HideFlags } from "./hide.js";
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

export const ROW_H = 28;
export const HEADER_H = 144;
export const LABEL_W = 300;
export const COL_W = 50;

export interface HoverInfo {
  template: Template;
  room: RoomRow;
  cell: MatrixCell | undefined;
}

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
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  // Наведение храним по стабильным id (roomId/templateId), а не по индексу строки —
  // иначе подсветка «съезжает» при смене состава строк (сворачивание/фильтр/скрытие).
  const [hover, setHover] = useState<{ roomId: number; templateId: number } | null>(null);

  const rowV = useVirtualizer({
    count: rooms.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });
  const colV = useVirtualizer({
    horizontal: true,
    count: templates.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => COL_W,
    overscan: 4,
  });

  const rowItems = rowV.getVirtualItems();
  const colItems = colV.getVirtualItems();
  const pinnedW = pinnedTemplates.length * COL_W;
  const contentW = LABEL_W + pinnedW + colV.getTotalSize();

  const setHovered = (h: { roomId: number; templateId: number } | null, info: HoverInfo | null) => {
    setHover(h);
    onHover?.(info);
  };

  const ctxHandler = (templateId: number) =>
    onTemplateContext
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          onTemplateContext(templateId, e.clientX, e.clientY);
        }
      : undefined;

  const headerCell = (t: Template, style: CSSProperties, pinned: boolean) => {
    const hot = hover?.templateId === t.id;
    const dim = highlightedTemplates && !highlightedTemplates.has(t.id);
    const mark = markedTemplates?.get(t.id);
    return (
      <div
        key={pinned ? `p${t.id}` : t.id}
        className={`mx-th${pinned ? " pinned" : ""}${hot ? " hot" : ""}${dim ? " dim" : ""}${mark ? " marked" : ""}`}
        style={style}
        title={t.comment ? `${t.name} — ${t.comment}` : t.name}
        onContextMenu={ctxHandler(t.id)}
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
  };

  const bodyCell = (
    t: Template,
    r: RoomRow,
    rowHot: boolean,
    style: CSSProperties,
    pinned: boolean,
  ) => {
    const cell = cellIndex.get(cellKey(t.id, r.roomId));
    const hot = hover?.templateId === t.id || rowHot;
    return (
      <div
        key={pinned ? `p${t.id}` : t.id}
        className={`mx-cell${pinned ? " pinned" : ""}${cell ? " filled" : ""}${hot ? " hot" : ""}`}
        style={style}
        title={cell ? describeCell(cell, t, r) : ""}
        onMouseEnter={() =>
          setHovered({ roomId: r.roomId, templateId: t.id }, { template: t, room: r, cell })
        }
      >
        {cell ? (
          <>
            <span className="mx-cell-text">{cellText(cell)}</span>
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
  };

  return (
    <div ref={parentRef} className="mx-scroll" onMouseLeave={() => setHovered(null, null)}>
      {/* Шапка */}
      <div className="mx-header" style={{ width: contentW, height: HEADER_H }}>
        <div className="mx-corner" style={{ width: LABEL_W, height: HEADER_H }}>
          <span className="mx-corner-title">Помещения \ Шаблоны</span>
          <span className="mx-corner-legend">
            <span className="c-rooms">помещений</span>
            <span className="c-emp">сотрудников</span>
          </span>
        </div>
        {pinnedTemplates.map((t, i) =>
          headerCell(
            t,
            { position: "sticky", left: LABEL_W + i * COL_W, width: COL_W, height: HEADER_H, zIndex: 5 },
            true,
          ),
        )}
        {colItems.map((col) =>
          headerCell(
            templates[col.index]!,
            { position: "absolute", left: LABEL_W + pinnedW + col.start, width: COL_W, height: HEADER_H },
            false,
          ),
        )}
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
              style={{ top: row.start, height: ROW_H, width: contentW }}
            >
              <div
                className={`mx-label${r.hasChildren ? " clickable" : ""}${rowMark ? " marked" : ""}`}
                style={{ width: LABEL_W, height: ROW_H }}
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
                <span className="mx-name">{r.name || `#${r.roomId}`}</span>
                {rowMark && hideMarks(rowMark, "шаблоны")}
              </div>
              {pinnedTemplates.map((t, i) =>
                bodyCell(
                  t,
                  r,
                  !!rowHot,
                  { position: "sticky", left: LABEL_W + i * COL_W, width: COL_W, height: ROW_H, zIndex: 1 },
                  true,
                ),
              )}
              {colItems.map((col) =>
                bodyCell(
                  templates[col.index]!,
                  r,
                  !!rowHot,
                  { position: "absolute", left: LABEL_W + pinnedW + col.start, width: COL_W, height: ROW_H },
                  false,
                ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
