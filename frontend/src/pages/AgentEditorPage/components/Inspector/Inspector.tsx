import { CloseIcon, IconButton } from "@/shared/ui";
import { useEditor } from "../../state/editorContext";
import { selectedAction, selectedNode } from "../../state/selectors";
import { ActionForm } from "../ActionForm/ActionForm";
import { AgentSettingsForm } from "../AgentSettingsForm/AgentSettingsForm";
import { NodeForm } from "../NodeForm/NodeForm";
import styles from "./Inspector.module.scss";

export interface InspectorProps {
  agentId: string | null;
  onClose: () => void;
}

/**
 * Floating card on the right that edits the selection: agent settings, a node or an
 * action. Hidden when nothing is selected. Forms are keyed by what they edit so
 * their local UI state resets when the selection changes.
 */
export function Inspector({ agentId, onClose }: InspectorProps) {
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
  } else if (selection.kind === "agent") {
    form = <AgentSettingsForm agentId={agentId} />;
  } else {
    return null;
  }

  return (
    <aside className={styles.card} aria-label="Inspector">
      <IconButton label="Close panel (Esc)" className={styles.close} onClick={onClose}>
        <CloseIcon width={16} height={16} />
      </IconButton>
      {form}
    </aside>
  );
}
