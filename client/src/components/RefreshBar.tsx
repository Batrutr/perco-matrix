// Кнопки обновления из PERCo + прогресс + время последнего обновления.
import type { RefreshKind, RefreshStatus, StateMeta } from "@perco/shared";

const KIND_LABEL: Record<RefreshKind, string> = {
    rooms: "помещения",
    templates: "шаблоны",
    all: "всё",
    employees: "сотрудники",
};

function fmtTime(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru");
}

/**
 * Компактная сводка свежести данных: одна дата (более старая из помещений и
 * шаблонов — ядро матрицы) вместо трёх таймстампов в ряд. Полная разбивка,
 * включая сотрудников, — во всплывающей подсказке. Три даты занимали ~580px и
 * на средних окнах переносились под кнопки, налезая на низ шапки.
 */
function freshness(meta: StateMeta | null): { text: string; title: string } {
    const rooms = meta?.lastUpdateRooms ?? null;
    const templates = meta?.lastUpdateTemplates ?? null;
    const employees = meta?.lastUpdateEmployees ?? null;
    const title = [
        `помещения: ${fmtTime(rooms)}`,
        `шаблоны: ${fmtTime(templates)}`,
        `сотрудники: ${fmtTime(employees)}`,
    ].join("\n");

    if (!rooms && !templates) return { text: "данные не загружены", title };
    if (!rooms || !templates) return { text: "данные загружены частично", title };
    const oldest = Date.parse(rooms) <= Date.parse(templates) ? rooms : templates;
    return { text: `данные от ${fmtTime(oldest)}`, title };
}

interface Props {
    meta: StateMeta | null;
    status: RefreshStatus;
    busy: boolean;
    error: string | null;
    onRefresh: (kind: RefreshKind) => void;
}

export function RefreshBar({ meta, status, busy, error, onRefresh }: Props) {
    const fresh = freshness(meta);
    return (
        <div className="refresh-bar">
            <div className="refresh-buttons">
                <button onClick={() => onRefresh("rooms")} disabled={busy}>
                    Обновить помещения
                </button>
                <button onClick={() => onRefresh("templates")} disabled={busy}>
                    Обновить шаблоны
                </button>
                <button onClick={() => onRefresh("employees")} disabled={busy} title="Быстро: только число сотрудников из БД PERCo">
                    Обновить сотрудников
                </button>
                <button onClick={() => onRefresh("all")} disabled={busy} className="primary">
                    Обновить всё
                </button>
            </div>

            <div className="refresh-status">
                {busy ? (
                    <span className="busy">
                        Обновление ({status.kind ? KIND_LABEL[status.kind] : "…"})
                        {status.total > 0 ? `: ${status.done} / ${status.total}` : "…"}
                    </span>
                ) : error ? (
                    <span className="err">Ошибка обновления: {error}</span>
                ) : (
                    <span className="times" title={fresh.title}>
                        {fresh.text}
                    </span>
                )}
            </div>
        </div>
    );
}
