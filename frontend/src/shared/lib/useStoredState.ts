import { useCallback, useState } from "react";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback; // Storage blocked (private mode, sandbox) or bad JSON.
  }
}

/**
 * useState that remembers its value in localStorage, for per-browser UI
 * preferences (a collapsed panel). Falls back silently when storage is unavailable.
 */
export function useStoredState<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState(() => read(key, fallback));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not persisted; the in-memory value still applies.
      }
    },
    [key],
  );

  return [value, update];
}
