import { useState } from "react";
import type { AgentAction } from "@/shared/types/agent";
import { Button, Section, Select } from "@/shared/ui";
import styles from "./ActionList.module.scss";

export interface ActionListProps {
  actions: AgentAction[];
  /** Node names an action can target (including the node itself). */
  targets: string[];
  defaultTarget: string;
  onSelect: (index: number) => void;
  onAdd: (target: string) => void;
}

/** A node's outgoing actions, plus a control to add one. */
export function ActionList({ actions, targets, defaultTarget, onSelect, onAdd }: ActionListProps) {
  const [target, setTarget] = useState(defaultTarget);
  // Fall back if the chosen target was renamed or deleted.
  const selectedTarget = targets.includes(target) ? target : defaultTarget;

  return (
    <Section
      title="Actions"
      description="Functions the agent can call to move on. You can also drag between nodes."
    >
      {actions.length > 0 && (
        <ul className={styles.list}>
          {actions.map((action, index) => (
            <li key={index}>
              <button
                type="button"
                className={styles.item}
                onClick={() => {
                  onSelect(index);
                }}
              >
                <span className={styles.fn}>{action.function}</span>
                <span className={styles.target}>→ {action.target}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.add}>
        <Select
          aria-label="Target node for new action"
          value={selectedTarget}
          options={targets.map((value) => ({ value }))}
          onChange={setTarget}
        />
        <Button
          onClick={() => {
            onAdd(selectedTarget);
          }}
        >
          + Add action
        </Button>
      </div>
    </Section>
  );
}
