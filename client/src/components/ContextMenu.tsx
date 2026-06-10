// Простое контекстное меню у курсора. Закрывается по Esc, клику вне и прокрутке.
import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  /** Нарисовать разделитель перед этим пунктом */
  divider?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }} role="menu">
      {items.map((it, i) => (
        <div key={i}>
          {it.divider && <div className="ctx-sep" />}
          <button
            type="button"
            className="ctx-item"
            role="menuitem"
            onClick={() => {
              it.onClick();
              onClose();
            }}
          >
            {it.label}
          </button>
        </div>
      ))}
    </div>
  );
}
