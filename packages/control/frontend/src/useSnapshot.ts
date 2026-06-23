import { useCallback, useEffect, useRef, useState } from 'react';

interface PollState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** Poll an async function on an interval, exposing data/error/loading + manual refresh. */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, key: string): PollState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      const next = await fnRef.current();
      setData(next);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void refresh();
    const id = setInterval(() => {
      if (alive) void refresh();
    }, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs]);

  return { data, error, loading, refresh };
}
