// Панель режима подбора: сводка требования и результаты (полные совпадения / комбинация
// / непокрытые помещения). Клик по шаблону-результату закрепляет его слева.
import type { Template } from "@perco/shared";

interface Props {
    selectedCount: number;
    fullMatches: Template[];
    combination: { template: Template; covers: number[] }[] | null;
    uncoveredNames: string[];
    onPick: (templateId: number) => void;
    onClear: () => void;
    onExit: () => void;
}

export function FinderPanel({
    selectedCount,
    fullMatches,
    combination,
    uncoveredNames,
    onPick,
    onClear,
    onExit,
}: Props) {
    const results =
        selectedCount === 0 ? (
            <div className="finder-hint">
                Кликайте по ячейкам столбца «Требование» — выберите помещения и задайте нужные отметки
                (график / охрана / antipass). Подходящие шаблоны появятся здесь.
            </div>
        ) : fullMatches.length > 0 ? (
            <div className="finder-results">
                <span className="finder-ok">Подходят целиком ({fullMatches.length}):</span>
                {fullMatches.map((t) => (
                    <button key={t.id} className="finder-tpl" title="Закрепить слева" onClick={() => onPick(t.id)}>
                        {t.name}
                    </button>
                ))}
            </div>
        ) : combination && combination.length > 0 ? (
            <div className="finder-results">
                <span className="finder-warn">
                    Целиком — никто. Комбинация ({combination.length}
                    {uncoveredNames.length ? ", частично" : ""}):
                </span>
                {combination.map(({ template, covers }) => (
                    <button
                        key={template.id}
                        className="finder-tpl"
                        title="Закрепить слева"
                        onClick={() => onPick(template.id)}
                    >
                        {template.name} <i>+{covers.length}</i>
                    </button>
                ))}
                {uncoveredNames.length > 0 && (
                    <span className="finder-uncovered">
                        Не покрываются: {uncoveredNames.join(", ")}
                    </span>
                )}
            </div>
        ) : (
            <div className="finder-hint">Подходящих шаблонов нет ни по одному выбранному помещению.</div>
        );

    return (
        <div className="finder-panel">
            <div className="finder-head">
                <b>Подбор шаблона</b>
                <span className="finder-count">выбрано помещений: {selectedCount}</span>
                <button onClick={onClear} disabled={selectedCount === 0}>
                    Сбросить
                </button>
                <button onClick={onExit}>Выйти из режима</button>
                {selectedCount > 0 && (
                    <span className="finder-legend">
                        отметки: буква — график (· — любой), О/о — охрана да/нет, А/а — antipass да/нет
                    </span>
                )}
            </div>
            {results}
        </div>
    );
}
