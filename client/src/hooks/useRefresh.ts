// Запуск обновления из PERCo и опрос статуса до завершения.
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const s = await fetchRefreshStatus();
      setStatus(s);
      if (!s.running) {
        stop();
        if (s.error) setError(s.error);
        else onDoneRef.current();
      }
    } catch (e) {
      stop();
      setStatus(IDLE);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [stop]);

  const trigger = useCallback(
    async (kind: RefreshKind) => {
      setError(null);
      try {
        const res = await startRefresh(kind);
        setStatus(res.status);
        // началось (или уже шло) — опрашиваем до завершения
        stop();
        timer.current = setInterval(() => void poll(), POLL_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [poll, stop],
  );

  useEffect(() => stop, [stop]);

  return { status, error, busy: status.running, trigger };
}
