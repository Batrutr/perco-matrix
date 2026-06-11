// Общие хуки поповеров у курсора (контекстное меню, редактор отметок).
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

/**
 * Закрытие поповера: mousedown вне элемента, Escape и (опционально) любая
 * прокрутка (capture-фаза). closeOnScroll=false — для редакторов с явной
 * кнопкой «Готово»: изменение данных может сжать контент сетки, браузер
 * клампит scrollLeft и порождает scroll-событие, которое закрыло бы поповер
 * прямо во время редактирования.
 */
export function useDismiss(
    ref: RefObject<HTMLElement | null>,
    onClose: () => void,
    closeOnScroll = true,
): void {
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        if (closeOnScroll) window.addEventListener("scroll", onClose, true);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
            if (closeOnScroll) window.removeEventListener("scroll", onClose, true);
        };
    }, [ref, onClose, closeOnScroll]);
}

/**
 * Позиция fixed-поповера у точки (x, y), прижатая к границам вьюпорта по
 * фактическому размеру элемента (меряем после монтирования, до отрисовки).
 */
export function useViewportClamp(
    ref: RefObject<HTMLElement | null>,
    x: number,
    y: number,
): { left: number; top: number } {
    const [pos, setPos] = useState({ left: x, top: y });
    useLayoutEffect(() => {
        const el = ref.current;
        const w = el?.offsetWidth ?? 0;
        const h = el?.offsetHeight ?? 0;
        setPos({
            left: Math.max(0, Math.min(x, window.innerWidth - w)),
            top: Math.max(0, Math.min(y, window.innerHeight - h)),
        });
    }, [ref, x, y]);
    return pos;
}
