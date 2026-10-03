import { useEffect, useRef } from "react";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Calls `handler` on Escape while `enabled`. Ignored while typing (inputs use Escape
 * to revert) and while a modal dialog is open (it handles its own Escape).
 */
export function useEscapeKey(enabled: boolean, handler: () => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isEditable(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      handlerRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);
}
