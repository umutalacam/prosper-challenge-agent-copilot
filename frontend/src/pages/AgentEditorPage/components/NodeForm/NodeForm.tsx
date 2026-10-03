import { useState } from "react";
import type { AgentNode } from "@/shared/types/agent";
import { Badge, Button, Checkbox, CommitInput, Field, TextArea } from "@/shared/ui";
import { useEditor } from "../../state/editorContext";
import { nodeNames } from "../../state/selectors";
import type { NodePatch } from "../../state/types";
import { ActionList } from "../ActionList/ActionList";
import { InspectorForm } from "../InspectorForm/InspectorForm";
import { TaskListEditor } from "../TaskListEditor/TaskListEditor";
import styles from "./NodeForm.module.scss";

export interface NodeFormProps {
  node: AgentNode;
}

export function NodeForm({ node }: NodeFormProps) {
  const { state, dispatch } = useEditor();
  const [nameError, setNameError] = useState<string | null>(null);
  const names = nodeNames(state);
  const isStart = state.agent.initial_node === node.name;

  const update = (patch: NodePatch) => {
    dispatch({ type: "updateNode", node: node.name, patch });
  };

  const validateName = (value: string) => {
    if (!value.trim()) return "Name is required.";
    if (names.includes(value)) return "Another node already has this name.";
    return null;
  };

  return (
    <InspectorForm
      title="Node"
      footer={
        <Button
          variant="danger"
          block
          disabled={isStart}
          title={isStart ? "Choose another start node first" : undefined}
          onClick={() => {
            dispatch({ type: "deleteNode", node: node.name });
          }}
        >
          Delete node
        </Button>
      }
    >
      <Field label="Name" hint="Press Enter to apply." error={nameError}>
        {(p) => (
          <CommitInput
            {...p}
            value={node.name}
            validate={validateName}
            onErrorChange={setNameError}
            onCommit={(to) => {
              dispatch({ type: "renameNode", from: node.name, to });
            }}
          />
        )}
      </Field>

      <div className={styles.flags}>
        {isStart ? (
          <Badge tone="success">Start node</Badge>
        ) : (
          <Button
            size="sm"
            onClick={() => {
              dispatch({ type: "updateAgent", patch: { initial_node: node.name } });
            }}
          >
            Make start node
          </Button>
        )}
        <Checkbox
          label="Ends the call"
          checked={node.end ?? false}
          onChange={(end) => {
            update({ end });
          }}
        />
      </div>

      <TaskListEditor
        tasks={node.task_messages}
        onChange={(task_messages) => {
          update({ task_messages });
        }}
      />

      <Field label="Personality override" hint="Leave empty to use the agent's personality.">
        {(p) => (
          <TextArea
            {...p}
            value={node.role_message ?? ""}
            onChange={(e) => {
              update({ role_message: e.target.value || undefined });
            }}
          />
        )}
      </Field>

      <ActionList
        actions={node.edges}
        targets={names}
        defaultTarget={node.name}
        onSelect={(index) => {
          dispatch({ type: "select", selection: { kind: "action", node: node.name, index } });
        }}
        onAdd={(target) => {
          dispatch({ type: "addAction", source: node.name, target });
        }}
      />
    </InspectorForm>
  );
}
