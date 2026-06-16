// Кнопка переключения темы: по клику циклически система → светлая → тёмная.
import { useTheme, type ThemeMode } from "../hooks/useTheme.js";

const LABEL: Record<ThemeMode, string> = {
    system: "🖥 Авто",
    light: "☀ Светлая",
    dark: "🌙 Тёмная",
};

const TITLE: Record<ThemeMode, string> = {
    system: "Тема: как в системе (клик — светлая)",
    light: "Тема: светлая (клик — тёмная)",
    dark: "Тема: тёмная (клик — как в системе)",
};

export function ThemeToggle() {
    const { mode, cycle } = useTheme();
    return (
        <button className="theme-toggle" onClick={cycle} title={TITLE[mode]}>
            {LABEL[mode]}
        </button>
    );
}
