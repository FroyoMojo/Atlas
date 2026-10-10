import { useEffect, useRef, useState } from "react";

/** Calls `fn` now and every `ms` while mounted. Returns the latest value and error. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    const run = () =>
      fnRef
        .current()
        .then((v) => alive && (setData(v), setError(null)))
        .catch((e) => alive && setError(String(e.message ?? e)));
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
