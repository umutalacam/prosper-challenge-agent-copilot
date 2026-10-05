// How each call outcome is shown, and the outcome filters the call log offers.
// Typed against CallOutcome: a new outcome won't compile until it's labelled here.

import type { CallOutcome } from "@/shared/types/call";
import type { BadgeTone } from "@/shared/ui";

export const OUTCOMES = {
  completed: { label: "Completed", tone: "success" },
  abandoned: { label: "Abandoned", tone: "neutral" },
  not_started: { label: "Not started", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
} as const satisfies Record<CallOutcome, { label: string; tone: BadgeTone }>;

/** The pills above the call list; `null` shows every call. */
export const OUTCOME_FILTERS = [
  { value: null, label: "All" },
  { value: "completed", label: OUTCOMES.completed.label },
  { value: "abandoned", label: OUTCOMES.abandoned.label },
  { value: "error", label: OUTCOMES.error.label },
] as const satisfies readonly { value: CallOutcome | null; label: string }[];
