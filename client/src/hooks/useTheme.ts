// Тема интерфейса: "system" (следовать за ОС), "light", "dark".
// Выбор хранится в localStorage и применяется атрибутом data-theme на <html>;
// CSS переопределяет переменные под [data-theme="dark"]. Скрипт в index.html
// выставляет атрибут ещё до отрисовки (без мигания); хук держит его в синхроне.
import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "perco-theme";
const ORDER: ThemeMode[] = ["system", "light", "dark"];

function readStored(): ThemeMode {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === "light" || v === "dark" || v === "system") return v;
    } catch {
        // localStorage недоступен (приватный режим и т.п.) — используем системную.
    }
    return "system";
}

function systemDark(): boolean {
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(mode: ThemeMode): void {
    const dark = mode === "dark" || (mode === "system" && systemDark());
    document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export interface UseTheme {
    mode: ThemeMode;
    setMode: (m: ThemeMode) => void;
    cycle: () => void;
}

export function useTheme(): UseTheme {
    const [mode, setModeState] = useState<ThemeMode>(readStored);

    // Применяем тему и сохраняем выбор.
    useEffect(() => {
        apply(mode);
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            // запись необязательна
        }
    }, [mode]);

    // В режиме "system" следим за сменой системной темы на лету.
    useEffect(() => {
        if (mode !== "system" || typeof matchMedia !== "function") return;
        const mq = matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => apply("system");
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, [mode]);

    const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
    const cycle = useCallback(
        () => setModeState((m) => ORDER[(ORDER.indexOf(m) + 1) % ORDER.length]!),
        [],
    );

    return { mode, setMode, cycle };
}
