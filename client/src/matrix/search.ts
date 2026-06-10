// Чистая логика поиска и сортировки (без React).
import type { Room, Template } from "@perco/shared";

/** Подстрочный поиск без учёта регистра. Пустой запрос совпадает со всем. */
export function nameMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q);
}

export type SortKey = "name" | "rooms" | "employees";
export type SortDir = "asc" | "desc";

/**
 * Сортировка шаблонов. employeeCount === null всегда уходит в конец (независимо от
 * направления). Вторичный ключ — имя, чтобы порядок был стабильным.
 */
export function sortTemplates(templates: Template[], key: SortKey, dir: SortDir): Template[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: Template, b: Template): number => a.name.localeCompare(b.name, "ru");

  return [...templates].sort((a, b) => {
    if (key === "name") {
      const cmp = byName(a, b) * sign;
      return cmp !== 0 ? cmp : a.id - b.id;
    }
    if (key === "rooms") {
      const cmp = (a.roomCount - b.roomCount) * sign;
      return cmp !== 0 ? cmp : byName(a, b);
    }
    // employees: null в конец при любом направлении
    const ae = a.employeeCount;
    const be = b.employeeCount;
    if (ae === null && be === null) return byName(a, b);
    if (ae === null) return 1;
    if (be === null) return -1;
    const cmp = (ae - be) * sign;
    return cmp !== 0 ? cmp : byName(a, b);
  });
}

/** roomId помещений, чьё имя подходит под запрос (для подсветки/скрытия строк). */
export function roomIdsMatchingName(rooms: Room[], query: string): Set<number> {
  const out = new Set<number>();
  if (!query.trim()) return out;
  for (const r of rooms) {
    if (nameMatches(r.name || `#${r.roomId}`, query)) out.add(r.roomId);
  }
  return out;
}

/** Пересечение двух множеств (для совмещения поиска и фильтра). */
export function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

/**
 * Сопоставить «важные» записи конфига (id или имя) с id существующих шаблонов.
 * Возвращает id в порядке записей конфига, без дублей.
 */
export function resolveTemplateIds(templates: Template[], entries: string[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const raw of entries) {
    const e = raw.trim();
    if (!e) continue;
    for (const t of templates) {
      if ((String(t.id) === e || t.name.trim() === e) && !seen.has(t.id)) {
        seen.add(t.id);
        ids.push(t.id);
      }
    }
  }
  return ids;
}
