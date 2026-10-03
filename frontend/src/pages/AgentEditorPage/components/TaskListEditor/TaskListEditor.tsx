import type { TaskMessage } from "@/shared/types/agent";
import { Button, IconButton, Section, TextArea } from "@/shared/ui";
import styles from "./TaskListEditor.module.scss";

const TASK_ROLE = "developer";

export interface TaskListEditorProps {
  tasks: TaskMessage[];
  onChange: (tasks: TaskMessage[]) => void;
}

/** Edits a node's `task_messages`: what the agent should do while in the node. */
export function TaskListEditor({ tasks, onChange }: TaskListEditorProps) {
  const setContent = (index: number, content: string) => {
    onChange(tasks.map((t, i) => (i === index ? { ...t, content } : t)));
  };

  return (
    <Section title="Tasks" description="What the agent should do while in this node.">
      {tasks.map((task, index) => (
        // Tasks have no identity beyond their position.
        <div key={index} className={styles.task}>
          <TextArea
            rows={4}
            aria-label={`Task ${index + 1}`}
            value={task.content}
            onChange={(e) => {
              setContent(index, e.target.value);
            }}
          />
          <IconButton
            label={`Remove task ${index + 1}`}
            onClick={() => {
              onChange(tasks.filter((_, i) => i !== index));
            }}
          >
            ×
          </IconButton>
        </div>
      ))}
      <Button
        block
        onClick={() => {
          onChange([...tasks, { role: TASK_ROLE, content: "" }]);
        }}
      >
        + Add task
      </Button>
    </Section>
  );
}
