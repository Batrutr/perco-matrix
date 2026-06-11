// Простое контекстное меню у курсора. Закрывается по Esc, клику вне и прокрутке.
import { useRef } from "react";
import { useDismiss, useViewportClamp } from "../hooks/usePopover.js";

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
  useDismiss(ref, onClose);
  const pos = useViewportClamp(ref, x, y);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: pos.left, top: pos.top }} role="menu">
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
