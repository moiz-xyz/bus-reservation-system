import { useEffect, useRef } from "react";

/** Calls `callback` now and then every `ms` milliseconds until unmount. */
export function usePolling(callback, ms, deps = []) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    saved.current();
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}
