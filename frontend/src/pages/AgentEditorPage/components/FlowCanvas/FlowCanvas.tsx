import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NodeCard, type NodeCardNode } from "../NodeCard/NodeCard";
import { useEditor } from "../../state/editorContext";
import { toFlowEdges, toFlowNodes, type ActionEdge, type Dimensions } from "./flowElements";
import styles from "./FlowCanvas.module.scss";

const nodeTypes = { agentNode: NodeCard };
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };

export interface FlowCanvasProps {
  /** Increment to re-fit the viewport, e.g. after auto-layout. */
  fitViewRequest: number;
}

/**
 * The node graph. Nodes and edges are derived from the editor state on every render;
 * React Flow only reports changes back (positions -> state, sizes -> local).
 */
export function FlowCanvas({ fitViewRequest }: FlowCanvasProps) {
  const { state, dispatch } = useEditor();
  const { fitView } = useReactFlow();
  const [measured, setMeasured] = useState<Dimensions>({});

  const nodes = useMemo(
    () => toFlowNodes(state.agent, state.selection, measured),
    [state.agent, state.selection, measured],
  );
  const edges = useMemo(
    () => toFlowEdges(state.agent, state.selection),
    [state.agent, state.selection],
  );

  useEffect(() => {
    if (!fitViewRequest) return;
    // Wait a frame so React Flow has the new positions before fitting.
    const frame = requestAnimationFrame(() => {
      void fitView({ ...FIT_VIEW_OPTIONS, duration: 300 });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [fitViewRequest, fitView]);

  const onNodesChange = useCallback(
    (changes: NodeChange<NodeCardNode>[]) => {
      const positions: Record<string, { x: number; y: number }> = {};
      const sizes: Dimensions = {};
      for (const change of changes) {
        if (change.type === "position" && change.position) positions[change.id] = change.position;
        if (change.type === "dimensions" && change.dimensions) sizes[change.id] = change.dimensions;
      }
      if (Object.keys(positions).length) dispatch({ type: "moveNodes", positions });
      if (Object.keys(sizes).length) {
        setMeasured((prev) => ({ ...prev, ...sizes }));
      }
    },
    [dispatch],
  );

  const onConnect = useCallback(
    ({ source, target }: Connection) => {
      dispatch({ type: "addAction", source, target });
    },
    [dispatch],
  );

  return (
    <div className={styles.canvas}>
      <ReactFlow<NodeCardNode, ActionEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
          dispatch({ type: "select", selection: { kind: "node", node: node.id } });
        }}
        onEdgeClick={(_, edge) => {
          if (!edge.data) return;
          const { node, index } = edge.data;
          dispatch({ type: "select", selection: { kind: "action", node, index } });
        }}
        onPaneClick={() => {
          dispatch({ type: "select", selection: { kind: "agent" } });
        }}
        // Deletion goes through the inspector so cascades and guards always apply.
        deleteKeyCode={null}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
