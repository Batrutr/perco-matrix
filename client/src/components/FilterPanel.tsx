// Панель фильтрации/подсветки по значениям ячеек.
import type { FilterMode, FilterState, TriState } from "../matrix/filter.js";

interface Props {
  filter: FilterState;
  schedules: Array<{ id: number; name: string }>;
  /** Сколько шаблонов/помещений сейчас совпадает (для подписи) */
  matched: { templates: number; rooms: number } | null;
  onChange: (next: FilterState) => void;
}

export function FilterPanel({ filter, schedules, matched, onChange }: Props) {
  const set = (patch: Partial<FilterState>): void => onChange({ ...filter, ...patch });

  return (
    <div className="filter-panel">
      <label className="filter-active">
        <input
          type="checkbox"
          checked={filter.active}
          onChange={(e) => set({ active: e.target.checked })}
        />
        Фильтр
      </label>

      <fieldset disabled={!filter.active} className="filter-controls">
        <label>
          Режим:
          <select
            value={filter.mode}
            onChange={(e) => set({ mode: e.target.value as FilterMode })}
          >
            <option value="highlight">подсветка</option>
            <option value="filter">скрытие</option>
          </select>
        </label>

        <label>
          График:
          <select
            value={filter.scheduleId ?? ""}
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
          <select value={filter.guard} onChange={(e) => set({ guard: e.target.value as TriState })}>
            <option value="any">любая</option>
            <option value="yes">да</option>
            <option value="no">нет</option>
          </select>
        </label>

        <label>
          Antipass:
          <select
            value={filter.antipass}
            onChange={(e) => set({ antipass: e.target.value as TriState })}
          >
            <option value="any">любой</option>
            <option value="yes">да</option>
            <option value="no">нет</option>
          </select>
        </label>

        {matched && (
          <span className="filter-matched">
            совпало: шаблонов {matched.templates}, помещений {matched.rooms}
          </span>
        )}
      </fieldset>
    </div>
  );
}
