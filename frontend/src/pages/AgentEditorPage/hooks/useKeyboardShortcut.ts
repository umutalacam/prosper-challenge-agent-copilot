import { useEffect, useRef } from "react";

/** Calls `handler` on ⌘/Ctrl + `key`, preventing the browser default (e.g. Save Page). */
export function useModKeyShortcut(key: string, handler: () => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key) {
        e.preventDefault();
        handlerRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [key]);
}
