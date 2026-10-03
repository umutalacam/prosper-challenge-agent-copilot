import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { useConfirm } from "@/shared/ui";

/**
 * Asks before leaving with unsaved changes — both in-app navigation (router blocker)
 * and closing/reloading the tab (beforeunload).
 *
 * Returns `allowNextNavigation()` for navigations that follow a successful save or
 * delete: they run before React re-renders with `dirty: false`, so the blocker would
 * otherwise still see the stale dirty flag.
 */
export function useUnsavedChangesGuard(dirty: boolean): () => void {
  const confirm = useConfirm();
  const bypass = useRef(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypass.current) {
      bypass.current = false;
      return false;
    }
    return dirty && currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirm({
      title: "Discard unsaved changes?",
      description: "Your edits to this agent haven't been saved.",
      confirmLabel: "Discard",
      tone: "danger",
    }).then((ok) => {
      if (ok) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);

  return useCallback(() => {
    bypass.current = true;
  }, []);
}
