import { useEffect, useRef, useState } from "react";

/**
 * Calls `fn` now and every `ms` while mounted. Returns the latest value and error.
 * When `deps` change the old value is cleared (never shown for the new inputs), and a response
 * that arrives after a newer one is dropped, so slow polls can't land out of order.
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    let issued = 0;
    let applied = 0;
    setData(null);
    setError(null);
    const run = () => {
      const n = ++issued;
      fnRef
        .current()
        .then((v) => {
          if (!alive || n < applied) return;
          applied = n;
          setData(v);
          setError(null);
        })
        .catch((e) => {
          if (!alive || n < applied) return;
          applied = n;
          setError(String(e.message ?? e));
        });
    };
    run();
    const id = setInterval(run, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
  return { data, error };
}
