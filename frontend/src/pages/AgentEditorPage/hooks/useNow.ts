import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs`, so relative times ("34 minutes
 * ago") stay right while a view is open, without refetching anything.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
