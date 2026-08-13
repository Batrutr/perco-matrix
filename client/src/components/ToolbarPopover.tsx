// Кнопка тулбара с всплывающей панелью под ней: так редко используемые группы
// контролов (сортировка, фильтр, дерево) не занимают постоянную высоту экрана.
//
// Панель — position: fixed по фактическому месту кнопки: у контейнера .app есть
// overflow, и absolute-панель обрезалась бы его границей.
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "../hooks/usePopover.js";

interface Props {
    /** Текст кнопки-триггера */
    label: ReactNode;
    title?: string;
    /** Подсветить триггер: «условие задано» (например, фильтр включён) */
    active?: boolean;
    /** Прижать панель к правому краю кнопки — для кнопок у правого края экрана */
    align?: "left" | "right";
    children: ReactNode;
}

export function ToolbarPopover({ label, title, active = false, align = "left", children }: Props) {
    const wrapRef = useRef<HTMLSpanElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    const close = useCallback(() => setOpen(false), []);
    // Не закрываем по прокрутке: тулбар неподвижен, а прокрутка матрицы (в том числе
    // от изменения самих контролов) иначе захлопывала бы панель во время работы.
    useDismiss(wrapRef, close, false);

    // Позиция под кнопкой, прижатая к вьюпорту по фактическому размеру панели.
    // useLayoutEffect — до отрисовки, поэтому стартовое «за экраном» не мигает.
    useLayoutEffect(() => {
        if (!open) return;
        const btn = btnRef.current;
        const panel = panelRef.current;
        if (!btn || !panel) return;
        const r = btn.getBoundingClientRect();
        const w = panel.offsetWidth;
        const h = panel.offsetHeight;
        const rawLeft = align === "right" ? r.right - w : r.left;
        setPos({
            left: Math.max(4, Math.min(rawLeft, window.innerWidth - w - 4)),
            top: Math.max(4, Math.min(r.bottom + 4, window.innerHeight - h - 4)),
        });
    }, [open, align]);

    return (
        <span ref={wrapRef} className="tb-pop">
            <button
                ref={btnRef}
                type="button"
                className={`tb-pop-btn${active ? " on" : ""}${open ? " open" : ""}`}
                title={title}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                {label}
                <span className="tb-pop-caret" aria-hidden="true">
                    ▾
                </span>
            </button>
            {open && (
                <div
                    ref={panelRef}
                    className="tb-pop-panel"
                    style={pos ?? { left: -9999, top: -9999 }}
                >
                    {children}
                </div>
            )}
        </span>
    );
}
