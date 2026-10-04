import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NODE_SIZE } from "../../lib/autoLayout";
import type { NodeHighlight } from "../../lib/nodeDiff";
import { NodeCard, type NodeCardNode } from "../NodeCard/NodeCard";
import { useEditor } from "../../state/editorContext";
import { toFlowEdges, toFlowNodes, type ActionEdge, type Dimensions } from "./flowElements";
import styles from "./FlowCanvas.module.scss";

const nodeTypes = { agentNode: NodeCard };
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };

export interface FlowCanvasProps {
  /** Increment to re-fit the viewport, e.g. after auto-layout. */
  fitViewRequest: number;
  /** Increment to zoom out to the whole graph, but only if part of it is off-screen. */
  revealRequest?: number;
  /** Glide the view to a node, e.g. one the copilot just added. A new `seq` re-triggers. */
  focusRequest?: { node: string; seq: number } | null;
  /** Nodes to highlight for a moment (just added / changed by the copilot). */
  highlights?: ReadonlyMap<string, NodeHighlight>;
  /** The copilot is working: arrows flow and the canvas edge glows. */
  working?: boolean;
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const GLIDE_MS = 600;

/**
 * The node graph. Nodes and edges are derived from the editor state on every render;
 * React Flow only reports changes back (positions -> state, sizes -> local).
 */
export function FlowCanvas({
  fitViewRequest,
  revealRequest = 0,
  focusRequest = null,
  highlights,
  working = false,
}: FlowCanvasProps) {
  const { state, dispatch } = useEditor();
  const { fitView, flowToScreenPosition, getNode, getNodes, getNodesBounds, getZoom, setCenter } =
    useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Dimensions>({});

  const nodes = useMemo(
    () => toFlowNodes(state.agent, state.selection, measured, highlights),
    [state.agent, state.selection, measured, highlights],
  );
  const edges = useMemo(
    () => toFlowEdges(state.agent, state.selection, working),
    [state.agent, state.selection, working],
  );

  useEffect(() => {
    if (!focusRequest) return;
    // A frame later React Flow has the node (and, usually, its measured size).
    const frame = requestAnimationFrame(() => {
      const node = getNode(focusRequest.node);
      if (!node) return;
      const width = node.measured?.width ?? NODE_SIZE.width;
      const height = node.measured?.height ?? NODE_SIZE.height;
      void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: getZoom(),
        duration: prefersReducedMotion() ? 0 : GLIDE_MS,
      });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focusRequest, getNode, getZoom, setCenter]);

  useEffect(() => {
    if (!revealRequest) return;
    // After any glide in progress, zoom out only if some node is outside the view.
    const timer = window.setTimeout(() => {
      const box = canvasRef.current?.getBoundingClientRect();
      if (!box) return;
      const bounds = getNodesBounds(getNodes());
      const topLeft = flowToScreenPosition({ x: bounds.x, y: bounds.y });
      const bottomRight = flowToScreenPosition({
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height,
      });
      const allVisible =
        topLeft.x >= box.left &&
        topLeft.y >= box.top &&
        bottomRight.x <= box.right &&
        bottomRight.y <= box.bottom;
      if (!allVisible)
        void fitView({ ...FIT_VIEW_OPTIONS, duration: prefersReducedMotion() ? 0 : 500 });
    }, GLIDE_MS + 100);
    return () => {
      clearTimeout(timer);
    };
  }, [revealRequest, fitView, flowToScreenPosition, getNodes, getNodesBounds]);

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

  // The graph rules (see actionTargets): React Flow refuses such drops while dragging.
  const isValidConnection = useCallback(
    ({ source, target }: Connection | Edge) =>
      source !== target &&
      target !== state.agent.initial_node &&
      !state.agent.nodes.find((n) => n.name === source)?.end,
    [state.agent],
  );

  return (
    <div ref={canvasRef} className={clsx(styles.canvas, working && styles.working)}>
      <ReactFlow<NodeCardNode, ActionEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => {
          dispatch({ type: "select", selection: { kind: "node", node: node.id } });
        }}
        onEdgeClick={(_, edge) => {
          if (!edge.data) return;
          const { node, index } = edge.data;
          dispatch({ type: "select", selection: { kind: "action", node, index } });
        }}
        onPaneClick={() => {
          dispatch({ type: "select", selection: { kind: "none" } });
        }}
        // Off: Delete/Backspace are handled by AgentEditor through the reducer, so
        // cascades and guards always apply.
        deleteKeyCode={null}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
      >
        <Background gap={20} />
        <Controls
          position="bottom-left"
          orientation="horizontal"
          showInteractive={false}
          className={styles.controls}
        />
        <MiniMap position="bottom-left" pannable zoomable className={styles.minimap} />
      </ReactFlow>
    </div>
  );
}
