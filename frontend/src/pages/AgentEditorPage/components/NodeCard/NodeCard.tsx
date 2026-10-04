import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import type { AgentNode } from "@/shared/types/agent";
import { Badge } from "@/shared/ui";
import { positionBelow } from "../../lib/autoLayout";
import type { Highlight } from "../../lib/agentDiff";
import { useEditor } from "../../state/editorContext";
import styles from "./NodeCard.module.scss";

export interface NodeCardData extends Record<string, unknown> {
  node: AgentNode;
  isStart: boolean;
  /** Just added / changed by the copilot: pops in or glows for a moment. */
  highlight?: Highlight;
}

export type NodeCardNode = Node<NodeCardData, "agentNode">;

/**
 * Canvas card for one conversation node. Drag from the bottom handle to add an
 * action, or use the "+" below it (draw.io-style) to add a connected node.
 */
export function NodeCard({ data, selected }: NodeProps<NodeCardNode>) {
  const { node, isStart, highlight } = data;
  const { state, dispatch } = useEditor();
  const { locked } = state; // the copilot is editing: no new actions or nodes from here
  const task = node.task_messages[0]?.content.trim();
  const actionCount = node.edges.length;

  return (
    <div
      className={clsx(
        styles.card,
        selected && styles.selected,
        highlight === "added" && styles.added,
        highlight === "changed" && styles.changed,
      )}
    >
      {/* Nothing leads into the start node. Its handle stays (hidden, not
          connectable) only so an invalid action, e.g. from the JSON view, still draws
          (and can be found and removed); saving it fails. */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={!isStart && !locked}
        className={clsx(styles.handle, isStart && styles.hiddenHandle)}
      />
      <div className={styles.header}>
        <span className={styles.name}>{node.name}</span>
        {isStart && <Badge tone="success">start</Badge>}
        {node.end && <Badge>end</Badge>}
      </div>
      <p className={clsx(styles.task, !task && styles.taskEmpty)}>{task || "No task yet"}</p>
      <div className={styles.footer}>
        {actionCount} {actionCount === 1 ? "action" : "actions"}
      </div>
      {/* An end node leads nowhere: same treatment as the start node's top handle. */}
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={!node.end && !locked}
        className={clsx(styles.handle, node.end && styles.hiddenHandle)}
      />

      {/* An end node finishes the call, so it doesn't offer a next step. The zone
          bridges the gap below the card, so moving onto the button keeps it shown. */}
      {!node.end && !locked && (
        <div className={clsx(styles.addZone, "nodrag", "nopan")}>
          <button
            type="button"
            className={styles.addButton}
            aria-label={`Add a node after ${node.name}`}
            title="Add a connected node"
            onClick={(e) => {
              // Don't let the click also select this node (React Flow's onNodeClick).
              e.stopPropagation();
              dispatch({
                type: "addNodeAfter",
                source: node.name,
                position: positionBelow(state.agent.nodes, node.name),
              });
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
