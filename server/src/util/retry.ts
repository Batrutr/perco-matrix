// Простой ретрай транзиентных ошибок с экспоненциальной задержкой.

export interface RetryOptions {
    /** Число повторных попыток сверх первой (2 = до 3 вызовов всего) */
    retries: number;
    /** Базовая задержка, мс (растёт ×2 на каждой попытке) */
    baseDelayMs: number;
    /** Считать ли ошибку транзиентной (иначе пробрасываем сразу) */
    isRetryable: (err: unknown) => boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt === opts.retries || !opts.isRetryable(err)) throw err;
            await sleep(opts.baseDelayMs * 2 ** attempt);
        }
    }
    throw lastErr;
}
