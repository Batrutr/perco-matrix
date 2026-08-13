// Кнопка масштаба сетки: по клику циклически компактно → обычно → крупно.
// Тот же паттерн, что у ThemeToggle.
import type { GridSizeMode } from "../hooks/useGridSize.js";

const LABEL: Record<GridSizeMode, string> = {
    compact: "▦ Компактно",
    normal: "▦ Обычно",
    large: "▦ Крупно",
};

const TITLE: Record<GridSizeMode, string> = {
    compact: "Масштаб сетки: компактный (клик — обычный)",
    normal: "Масштаб сетки: обычный (клик — крупный, имена шаблонов длиннее)",
    large: "Масштаб сетки: крупный (клик — компактный)",
};

interface Props {
    mode: GridSizeMode;
    onCycle: () => void;
}

export function SizeToggle({ mode, onCycle }: Props) {
    return (
        <button className="size-toggle" onClick={onCycle} title={TITLE[mode]}>
            {LABEL[mode]}
        </button>
    );
}
