// Виртуализированная сетка матрицы: строки (помещения) и столбцы (шаблоны)
// виртуализируются по обеим осям; шапка и первый столбец зафиксированы (sticky).
import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { MatrixCell, Template } from "@perco/shared";
import { cellKey, cellText, describeCell, type RoomRow } from "./model.js";
import "./matrix.css";

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
  templates: Template[];
  cellIndex: Map<string, MatrixCell>;
  collapsed: ReadonlySet<number>;
  highlightedTemplates?: ReadonlySet<number>;
  highlightedRooms?: ReadonlySet<number>;
  /** Шаблоны, через которые сейчас что-то скрыто (метка в шапке) */
  markedTemplates?: ReadonlySet<number>;
  /** Помещения, через которые сейчас что-то скрыто (метка у ярлыка) */
  markedRooms?: ReadonlySet<number>;
  onToggle: (roomId: number) => void;
  onHover?: (info: HoverInfo | null) => void;
  onTemplateContext?: (templateId: number, x: number, y: number) => void;
  onRoomContext?: (roomId: number, x: number, y: number) => void;
}

export function MatrixGrid({
  rooms,
  templates,
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
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);

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
  const contentW = LABEL_W + colV.getTotalSize();

  const setHovered = (h: { row: number; col: number } | null, info: HoverInfo | null): void => {
    setHover(h);
    onHover?.(info);
  };

  return (
    <div
      ref={parentRef}
      className="mx-scroll"
      onMouseLeave={() => setHovered(null, null)}
    >
      {/* Шапка: названия шаблонов (sticky top), угол (sticky top+left) */}
      <div className="mx-header" style={{ width: contentW, height: HEADER_H }}>
        <div className="mx-corner" style={{ width: LABEL_W, height: HEADER_H }}>
          <span className="mx-corner-title">Помещения \ Шаблоны</span>
          <span className="mx-corner-legend">
            <span className="c-rooms">помещений</span>
            <span className="c-emp">сотрудников</span>
          </span>
        </div>
        {colItems.map((col) => {
          const t = templates[col.index]!;
          const hot = hover?.col === col.index;
          const dim = highlightedTemplates && !highlightedTemplates.has(t.id);
          const marked = markedTemplates?.has(t.id);
          return (
            <div
              key={col.key}
              className={`mx-th${hot ? " hot" : ""}${dim ? " dim" : ""}${marked ? " marked" : ""}`}
              style={{ left: LABEL_W + col.start, width: COL_W, height: HEADER_H }}
              title={t.comment ? `${t.name} — ${t.comment}` : t.name}
              onContextMenu={
                onTemplateContext
                  ? (e) => {
                      e.preventDefault();
                      onTemplateContext(t.id, e.clientX, e.clientY);
                    }
                  : undefined
              }
            >
              {marked && (
                <span className="mx-hidemark" title="Через этот шаблон скрыты помещения (ПКМ → Показать)">
                  ⊘
                </span>
              )}
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
        })}
      </div>

      {/* Тело */}
      <div className="mx-body" style={{ width: contentW, height: rowV.getTotalSize() }}>
        {rowItems.map((row) => {
          const r = rooms[row.index]!;
          const rowHot = hover?.row === row.index;
          const rowDim = highlightedRooms && !highlightedRooms.has(r.roomId);
          const rowMarked = markedRooms?.has(r.roomId);
          return (
            <div
              key={row.key}
              className={`mx-row${rowHot ? " hot" : ""}${rowDim ? " dim" : ""}`}
              style={{ top: row.start, height: ROW_H, width: contentW }}
            >
              <div
                className={`mx-label${r.hasChildren ? " clickable" : ""}${rowMarked ? " marked" : ""}`}
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
                {rowMarked && (
                  <span className="mx-hidemark" title="Через это помещение скрыты шаблоны (ПКМ → Показать)">
                    ⊘
                  </span>
                )}
              </div>
              {colItems.map((col) => {
                const t = templates[col.index]!;
                const cell = cellIndex.get(cellKey(t.id, r.roomId));
                const hot = hover?.col === col.index || rowHot;
                return (
                  <div
                    key={col.key}
                    className={`mx-cell${cell ? " filled" : ""}${hot ? " hot" : ""}`}
                    style={{ left: LABEL_W + col.start, width: COL_W, height: ROW_H }}
                    title={cell ? describeCell(cell, t, r) : ""}
                    onMouseEnter={() =>
                      setHovered({ row: row.index, col: col.index }, { template: t, room: r, cell })
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
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
