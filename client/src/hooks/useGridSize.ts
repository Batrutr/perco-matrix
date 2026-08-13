// Масштаб сетки матрицы: три пресета геометрии (строки/столбцы/ярлыки/шапка).
// Выбор хранится в localStorage; «крупно» решает главную проблему читаемости —
// обрезание вертикальных имён шаблонов в шапке (~15 символов при «обычно»).
import { useCallback, useState } from "react";

export type GridSizeMode = "compact" | "normal" | "large";

export interface GridSizes {
    rowH: number;
    headerH: number;
    labelW: number;
    colW: number;
}

export const GRID_SIZES: Record<GridSizeMode, GridSizes> = {
    compact: { rowH: 24, headerH: 110, labelW: 240, colW: 42 },
    normal: { rowH: 28, headerH: 144, labelW: 300, colW: 50 },
    large: { rowH: 32, headerH: 210, labelW: 380, colW: 58 },
};

const STORAGE_KEY = "perco-grid-size";
const ORDER: GridSizeMode[] = ["compact", "normal", "large"];

function readStored(): GridSizeMode {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === "compact" || v === "normal" || v === "large") return v;
    } catch {
        // localStorage недоступен — используем «обычно»
    }
    return "normal";
}

export interface UseGridSize {
    mode: GridSizeMode;
    sizes: GridSizes;
    cycle: () => void;
}

export function useGridSize(): UseGridSize {
    const [mode, setMode] = useState<GridSizeMode>(readStored);

    const cycle = useCallback(() => {
        setMode((m) => {
            const next = ORDER[(ORDER.indexOf(m) + 1) % ORDER.length]!;
            try {
                localStorage.setItem(STORAGE_KEY, next);
            } catch {
                // запись необязательна
            }
            return next;
        });
    }, []);

    return { mode, sizes: GRID_SIZES[mode], cycle };
}
