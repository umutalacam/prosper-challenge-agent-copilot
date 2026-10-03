import type { AgentAction } from "@/shared/types/agent";
import { Button, Field, Input, Select, TextArea } from "@/shared/ui";
import { toIdentifierChars } from "../../lib/naming";
import { useEditor } from "../../state/editorContext";
import { nodeNames } from "../../state/selectors";
import type { ActionPatch } from "../../state/types";
import { FieldsEditor } from "../FieldsEditor/FieldsEditor";
import { InspectorForm } from "../InspectorForm/InspectorForm";

export interface ActionFormProps {
  node: string;
  index: number;
  action: AgentAction;
}

export function ActionForm({ node, index, action }: ActionFormProps) {
  const { state, dispatch } = useEditor();
  const siblings = state.agent.nodes
    .find((n) => n.name === node)
    ?.edges.filter((_, i) => i !== index)
    .map((e) => e.function);
  const duplicate = siblings?.includes(action.function) ?? false;

  const update = (patch: ActionPatch) => {
    dispatch({ type: "updateAction", node, index, patch });
  };

  return (
    <InspectorForm
      title="Action"
      breadcrumb={
        <Button
          variant="link"
          onClick={() => {
            dispatch({ type: "select", selection: { kind: "node", node } });
          }}
        >
          ← Node {node}
        </Button>
      }
      footer={
        <Button
          variant="danger"
          block
          onClick={() => {
            dispatch({ type: "deleteAction", node, index });
          }}
        >
          Delete action
        </Button>
      }
    >
      <Field
        label="Function name"
        hint="The tool name the LLM calls."
        error={
          !action.function
            ? "Function name is required."
            : duplicate
              ? "Another action on this node has this name."
              : null
        }
      >
        {(p) => (
          <Input
            {...p}
            value={action.function}
            onChange={(e) => {
              update({ function: toIdentifierChars(e.target.value) });
            }}
          />
        )}
      </Field>

      <Field label="When to call it" hint="The LLM reads this to decide when to take the action.">
        {(p) => (
          <TextArea
            {...p}
            value={action.description}
            onChange={(e) => {
              update({ description: e.target.value });
            }}
          />
        )}
      </Field>

      <Field label="Goes to">
        {(p) => (
          <Select
            {...p}
            value={action.target}
            options={nodeNames(state).map((value) => ({ value }))}
            onChange={(target) => {
              update({ target });
            }}
          />
        )}
      </Field>

      <FieldsEditor action={action} onChange={update} />
    </InspectorForm>
  );
}
