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

interface Props {
    meta: StateMeta | null;
    status: RefreshStatus;
    busy: boolean;
    error: string | null;
    onRefresh: (kind: RefreshKind) => void;
}

export function RefreshBar({ meta, status, busy, error, onRefresh }: Props) {
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
                    <span className="times">
                        помещения: {fmtTime(meta?.lastUpdateRooms ?? null)} · шаблоны:{" "}
                        {fmtTime(meta?.lastUpdateTemplates ?? null)} · сотрудники:{" "}
                        {fmtTime(meta?.lastUpdateEmployees ?? null)}
                    </span>
                )}
            </div>
        </div>
    );
}
