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
import type { FocusRequest } from "../../hooks/useEditHighlights";
import { EMPTY_DIFF, type AgentDiff, type Highlight } from "../../lib/agentDiff";
import { NODE_SIZE } from "../../lib/autoLayout";
import { NodeCard, type NodeCardNode } from "../NodeCard/NodeCard";
import { useEditor } from "../../state/editorContext";
import { toFlowEdges, toFlowNodes, type ActionEdge, type Dimensions } from "./flowElements";
import { focusView, unionBox, type Box } from "./viewport";
import styles from "./FlowCanvas.module.scss";

const nodeTypes = { agentNode: NodeCard };
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };

/** An action the copilot just touched: drawn in (added) or glowing (changed). */
const EDGE_HIGHLIGHT_CLASS: Record<Highlight, string | undefined> = {
  added: styles.edgeAdded,
  changed: styles.edgeChanged,
};

export interface FlowCanvasProps {
  /** Increment to re-fit the viewport, e.g. after auto-layout. */
  fitViewRequest: number;
  /** Increment to show the whole graph once any glide in progress has finished. */
  revealRequest?: number;
  /** Glide to these nodes (what the copilot just touched), keeping the zoom if they fit. */
  focusRequest?: FocusRequest | null;
  /** Nodes and actions to highlight for a moment (just added / changed by the copilot). */
  highlights?: AgentDiff;
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
  highlights = EMPTY_DIFF,
  working = false,
}: FlowCanvasProps) {
  const { state, dispatch } = useEditor();
  const { locked } = state;
  const { fitView, getNode, getZoom, setCenter } = useReactFlow<NodeCardNode, ActionEdge>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Dimensions>({});

  const nodes = useMemo(
    () => toFlowNodes(state.agent, state.selection, measured, highlights.nodes),
    [state.agent, state.selection, measured, highlights.nodes],
  );
  const edges = useMemo(
    () =>
      toFlowEdges(state.agent, state.selection, working, highlights.actions).map((edge) => {
        const highlight = edge.data?.highlight;
        return highlight ? { ...edge, className: EDGE_HIGHLIGHT_CLASS[highlight] } : edge;
      }),
    [state.agent, state.selection, working, highlights.actions],
  );

  useEffect(() => {
    if (!focusRequest) return;
    // A frame later React Flow has the nodes (and, usually, their measured sizes).
    const frame = requestAnimationFrame(() => {
      const view = canvasRef.current?.getBoundingClientRect();
      const target = unionBox(
        focusRequest.nodes.flatMap((id): Box[] => {
          const node = getNode(id);
          if (!node) return []; // e.g. deleted by a later edit
          return [
            {
              ...node.position,
              width: node.measured?.width ?? NODE_SIZE.width,
              height: node.measured?.height ?? NODE_SIZE.height,
            },
          ];
        }),
      );
      if (!view || !target) return;
      const { x, y, zoom } = focusView(target, view, getZoom());
      void setCenter(x, y, { zoom, duration: prefersReducedMotion() ? 0 : GLIDE_MS });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focusRequest, getNode, getZoom, setCenter]);

  useEffect(() => {
    if (!revealRequest) return;
    // After any glide in progress, step back to the whole graph.
    const timer = window.setTimeout(() => {
      void fitView({ ...FIT_VIEW_OPTIONS, duration: prefersReducedMotion() ? 0 : 500 });
    }, GLIDE_MS + 100);
    return () => {
      clearTimeout(timer);
    };
  }, [revealRequest, fitView]);

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
        // Read-only while the copilot edits (the reducer refuses edits anyway).
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        elementsSelectable={!locked}
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
