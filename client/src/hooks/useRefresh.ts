// Запуск обновления из PERCo и опрос статуса до завершения.
// Опрос — цепочкой setTimeout (следующий запрос только после завершения предыдущего),
// чтобы не накладывать запросы; setState защищён флагом mounted.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefreshKind, RefreshStatus } from "@perco/shared";
import { fetchRefreshStatus, startRefresh } from "../api/client.js";

const IDLE: RefreshStatus = { running: false, kind: null, done: 0, total: 0, error: null };
const POLL_MS = 500;

export interface UseRefresh {
    status: RefreshStatus;
    error: string | null;
    busy: boolean;
    trigger: (kind: RefreshKind) => Promise<void>;
}

export function useRefresh(onDone: () => void): UseRefresh {
    const [status, setStatus] = useState<RefreshStatus>(IDLE);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mounted = useRef(false);
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;

    const stop = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);

    const poll = useCallback(async () => {
        let s: RefreshStatus;
        try {
            s = await fetchRefreshStatus();
        } catch (e) {
            if (!mounted.current) return;
            stop();
            setStatus(IDLE);
            setError(e instanceof Error ? e.message : String(e));
            return;
        }
        if (!mounted.current) return;
        setStatus(s);
        if (s.running) {
            timer.current = setTimeout(() => void poll(), POLL_MS);
        } else {
            stop();
            if (s.error) setError(s.error);
            else onDoneRef.current();
        }
    }, [stop]);

    const trigger = useCallback(
        async (kind: RefreshKind) => {
            setError(null);
            try {
                const res = await startRefresh(kind);
                if (!mounted.current) return;
                setStatus(res.status);
                stop();
                timer.current = setTimeout(() => void poll(), POLL_MS);
            } catch (e) {
                if (mounted.current) setError(e instanceof Error ? e.message : String(e));
            }
        },
        [poll, stop],
    );

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            stop();
        };
    }, [stop]);

    return { status, error, busy: status.running, trigger };
}
