// Подбор шаблона по требованию: пользователь задаёт для выбранных помещений нужные
// отметки (график/охрана/antipass, каждое поле — «любой»), а мы ищем шаблоны, которые
// это «покрывают» (дают доступ во все выбранные помещения с нужными отметками; лишний
// доступ допустим). Если целиком не подходит никто — жадный set-cover из нескольких.
import type { MatrixCell, Template } from "@perco/shared";
import { matchCell, type CellCriteria } from "./filter.js";
import { cellKey, scheduleAbbr } from "./model.js";

/** Желаемые отметки для одного помещения. null/any = «неважно». */
export type CellSpec = CellCriteria;

export const ANY_SPEC: CellSpec = { scheduleId: null, guard: "any", antipass: "any" };

/** Требование: roomId → желаемые отметки. Ключи = выбранные помещения. */
export type Requirement = ReadonlyMap<number, CellSpec>;

/** Удовлетворяет ли ячейка спецификации (нет ячейки = нет доступа = не удовлетворяет). */
export function cellSatisfies(cell: MatrixCell | undefined, spec: CellSpec): boolean {
    return cell !== undefined && matchCell(cell, spec);
}

/** Короткая подпись отметок требования: график (или «·»), охрана О/о, antipass А/а. */
export function specLabel(spec: CellSpec, scheduleName: ReadonlyMap<number, string>): string {
    let s = spec.scheduleId !== null ? scheduleAbbr(scheduleName.get(spec.scheduleId) ?? "") : "·";
    if (spec.guard === "yes") s += "О";
    else if (spec.guard === "no") s += "о";
    if (spec.antipass === "yes") s += "А";
    else if (spec.antipass === "no") s += "а";
    return s;
}

/** Множество требуемых помещений, которые шаблон удовлетворяет. */
export function templateSatisfies(
    cellIndex: Map<string, MatrixCell>,
    templateId: number,
    req: Requirement,
): Set<number> {
    const out = new Set<number>();
    for (const [roomId, spec] of req) {
        if (cellSatisfies(cellIndex.get(cellKey(templateId, roomId)), spec)) out.add(roomId);
    }
    return out;
}

/** id шаблонов, покрывающих ВСЁ требование целиком. */
export function findFullMatches(
    templates: Template[],
    cellIndex: Map<string, MatrixCell>,
    req: Requirement,
): number[] {
    if (req.size === 0) return [];
    const res: number[] = [];
    for (const t of templates) {
        if (templateSatisfies(cellIndex, t.id, req).size === req.size) res.push(t.id);
    }
    return res;
}

export interface Combination {
    /** Выбранные шаблоны и какие требуемые помещения каждый покрывает (новые на момент выбора) */
    chosen: { templateId: number; covers: number[] }[];
    /** Помещения, которые не покрывает ни один шаблон */
    uncovered: number[];
}

/**
 * Жадный set-cover: на каждом шаге берём шаблон, покрывающий больше всего ещё
 * непокрытых требуемых помещений. Не гарантирует абсолютный минимум (set-cover
 * NP-труден), но даёт хороший практичный набор.
 */
export function greedySetCover(
    templates: Template[],
    cellIndex: Map<string, MatrixCell>,
    req: Requirement,
): Combination {
    const sat = new Map<number, Set<number>>();
    for (const t of templates) {
        const s = templateSatisfies(cellIndex, t.id, req);
        if (s.size > 0) sat.set(t.id, s);
    }

    const remaining = new Set(req.keys());
    const chosen: { templateId: number; covers: number[] }[] = [];

    while (remaining.size > 0) {
        let bestId: number | null = null;
        let bestCover: number[] = [];
        for (const [tid, s] of sat) {
            const cover: number[] = [];
            for (const r of remaining) if (s.has(r)) cover.push(r);
            if (cover.length > bestCover.length) {
                bestId = tid;
                bestCover = cover;
            }
        }
        if (bestId === null || bestCover.length === 0) break;
        chosen.push({ templateId: bestId, covers: bestCover });
        for (const r of bestCover) remaining.delete(r);
        sat.delete(bestId);
    }

    return { chosen, uncovered: [...remaining] };
}
