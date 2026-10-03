import { useEditor } from "../../state/editorContext";
import { selectedAction, selectedNode } from "../../state/selectors";
import { ActionForm } from "../ActionForm/ActionForm";
import { AgentSettingsForm } from "../AgentSettingsForm/AgentSettingsForm";
import { NodeForm } from "../NodeForm/NodeForm";
import styles from "./Inspector.module.scss";

export interface InspectorProps {
  agentId: string | null;
}

/**
 * Edits whatever is selected: an action, a node, or (by default) the agent itself.
 * Forms are keyed by what they edit so local UI state resets on selection change.
 */
export function Inspector({ agentId }: InspectorProps) {
  const { state } = useEditor();
  const { selection } = state;
  const node = selectedNode(state);
  const action = selectedAction(state);

  let form;
  if (selection.kind === "action" && action) {
    form = (
      <ActionForm
        key={`${selection.node}::${selection.index}`}
        node={selection.node}
        index={selection.index}
        action={action}
      />
    );
  } else if (node) {
    form = <NodeForm key={node.name} node={node} />;
  } else {
    form = <AgentSettingsForm agentId={agentId} />;
  }

  return (
    <aside className={styles.inspector} aria-label="Inspector">
      {form}
    </aside>
  );
}
