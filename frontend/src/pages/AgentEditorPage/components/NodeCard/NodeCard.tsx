import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import type { AgentNode } from "@/shared/types/agent";
import { Badge } from "@/shared/ui";
import styles from "./NodeCard.module.scss";

export interface NodeCardData extends Record<string, unknown> {
  node: AgentNode;
  isStart: boolean;
}

export type NodeCardNode = Node<NodeCardData, "agentNode">;

/** Canvas card for one conversation node. Drag from the bottom handle to add an action. */
export function NodeCard({ data, selected }: NodeProps<NodeCardNode>) {
  const { node, isStart } = data;
  const task = node.task_messages[0]?.content.trim();
  const actionCount = node.edges.length;

  return (
    <div className={clsx(styles.card, selected && styles.selected)}>
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <div className={styles.header}>
        <span className={styles.name}>{node.name}</span>
        {isStart && <Badge tone="success">start</Badge>}
        {node.end && <Badge>end</Badge>}
      </div>
      <p className={clsx(styles.task, !task && styles.taskEmpty)}>{task || "No task yet"}</p>
      <div className={styles.footer}>
        {actionCount} {actionCount === 1 ? "action" : "actions"}
      </div>
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  );
}
