import { clsx } from "clsx";
import type { CallOutcome } from "@/shared/types/call";
import { OUTCOME_FILTERS } from "../../lib/callOutcomes";
import styles from "./OutcomeFilter.module.scss";

export interface OutcomeFilterProps {
  /** The outcome shown; null shows every call. */
  value: CallOutcome | null;
  onChange: (value: CallOutcome | null) => void;
}

/** Pills that narrow the call log to one outcome. */
export function OutcomeFilter({ value, onChange }: OutcomeFilterProps) {
  return (
    <div className={styles.filter} role="group" aria-label="Filter calls by outcome">
      {OUTCOME_FILTERS.map((option) => (
        <button
          key={option.label}
          type="button"
          className={clsx(styles.pill, option.value === value && styles.active)}
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
