import { useEffect, useRef } from "react";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Calls `handler` when one of `keys` is pressed while `enabled`. Ignored while
 * typing (inputs use Escape to revert and Backspace to edit) and while a modal
 * dialog is open (it handles its own keys).
 */
export function useKeyPress(keys: readonly string[], enabled: boolean, handler: () => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  // Stable dependency for the listener, whatever array the caller passes.
  const keyList = keys.join(" ");

  useEffect(() => {
    if (!enabled) return;
    const watched = keyList.split(" ");
    const onKeyDown = (e: KeyboardEvent) => {
      if (!watched.includes(e.key) || e.defaultPrevented || isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave shortcuts like ⌘⌫ alone
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      handlerRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, keyList]);
}
