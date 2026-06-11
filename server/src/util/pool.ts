// Ограничитель параллелизма для N+1 загрузки деталей шаблонов.
// Запускает не более `limit` worker'ов одновременно, сохраняя порядок результатов.

export interface PoolOptions {
    /** Вызывается после завершения каждого элемента: (сделано, всего) */
    onProgress?: (done: number, total: number) => void;
}

export async function runWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
    opts: PoolOptions = {},
): Promise<R[]> {
    const total = items.length;
    const results = new Array<R>(total);
    let nextIndex = 0;
    let done = 0;

    // Защита от мусорного limit (NaN/0/отрицательного): иначе Array.from({length:NaN})
    // даст пустой пул и НИ ОДИН worker не запустится (тихий сбой N+1).
    const safeLimit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1;
    const effectiveLimit = Math.max(1, Math.min(safeLimit, total));

    async function runner(): Promise<void> {
        while (true) {
            const i = nextIndex++;
            if (i >= total) return;
            results[i] = await worker(items[i]!, i);
            done++;
            opts.onProgress?.(done, total);
        }
    }

    await Promise.all(Array.from({ length: effectiveLimit }, () => runner()));
    return results;
}
