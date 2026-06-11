// Поповер у курсора: отметки требования для одного помещения (режим подбора).
import { useRef } from "react";
import type { CellSpec } from "../matrix/finder.js";
import type { TriState } from "../matrix/filter.js";
import { useDismiss, useViewportClamp } from "../hooks/usePopover.js";

interface Props {
    x: number;
    y: number;
    roomName: string;
    spec: CellSpec;
    schedules: Array<{ id: number; name: string }>;
    onChange: (spec: CellSpec) => void;
    onRemove: () => void;
    onClose: () => void;
}

export function SpecEditor({ x, y, roomName, spec, schedules, onChange, onRemove, onClose }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    // Не закрываем по прокрутке: правка спеки сжимает набор столбцов сетки,
    // кламп scrollLeft породил бы scroll-событие и закрыл редактор посреди работы.
    useDismiss(ref, onClose, false);
    const pos = useViewportClamp(ref, x, y);

    const set = (patch: Partial<CellSpec>) => onChange({ ...spec, ...patch });

    return (
        <div ref={ref} className="spec-editor" style={{ left: pos.left, top: pos.top }}>
            <div className="spec-editor-title">{roomName}</div>
            <label>
                График:
                <select
                    value={spec.scheduleId ?? ""}
                    onChange={(e) => set({ scheduleId: e.target.value ? Number(e.target.value) : null })}
                >
                    <option value="">любой</option>
                    {schedules.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Охрана:
                <select value={spec.guard} onChange={(e) => set({ guard: e.target.value as TriState })}>
                    <option value="any">любая</option>
                    <option value="yes">да</option>
                    <option value="no">нет</option>
                </select>
            </label>
            <label>
                Antipass:
                <select value={spec.antipass} onChange={(e) => set({ antipass: e.target.value as TriState })}>
                    <option value="any">любой</option>
                    <option value="yes">да</option>
                    <option value="no">нет</option>
                </select>
            </label>
            <div className="spec-editor-actions">
                <button onClick={onRemove}>Убрать</button>
                <button onClick={onClose}>Готово</button>
            </div>
        </div>
    );
}
