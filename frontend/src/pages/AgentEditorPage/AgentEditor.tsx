import { ReactFlowProvider } from "@xyflow/react";
import { clsx } from "clsx";
import { useMemo, useReducer, useState } from "react";
import { useNavigate } from "react-router";
import { useAgentsLayout } from "@/pages/AgentsLayout/layoutContext";
import { errorMessage, useDeleteAgent, useSaveAgent } from "@/shared/api";
import type { Agent } from "@/shared/types/agent";
import { Banner, useConfirm } from "@/shared/ui";
import { EditorToolbar } from "./components/EditorToolbar/EditorToolbar";
import { FlowCanvas } from "./components/FlowCanvas/FlowCanvas";
import { Inspector } from "./components/Inspector/Inspector";
import { useEscapeKey } from "./hooks/useEscapeKey";
import { useModKeyShortcut } from "./hooks/useKeyboardShortcut";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";
import { autoLayout, nextNodePosition, withPositions } from "./lib/autoLayout";
import { EditorContext } from "./state/editorContext";
import { createEditorState, editorReducer, NO_SELECTION } from "./state/editorReducer";
import styles from "./AgentEditor.module.scss";

export interface AgentEditorProps {
  /** The stored agent's id, or null for a new, never-saved agent. */
  agentId: string | null;
  initialAgent: Agent;
}

/**
 * Owns one agent's working copy (the reducer) plus save/delete, and lays out the
 * editor: a full-bleed canvas with the toolbar and inspector card floating over it.
 * Mount it with a `key` per agent so switching agents starts from a fresh state.
 */
export function AgentEditor({ agentId, initialAgent }: AgentEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, initialAgent, (agent) =>
    // A brand-new agent opens on its settings so the first thing you do is name it.
    createEditorState(withPositions(agent), agentId ? NO_SELECTION : { kind: "agent" }),
  );
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { sidebarOpen } = useAgentsLayout();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const saveAgent = useSaveAgent();
  const deleteAgent = useDeleteAgent();
  const allowNextNavigation = useUnsavedChangesGuard(state.dirty);

  const save = async () => {
    if (!state.dirty || saveAgent.isPending) return;
    const snapshot = state.agent;
    try {
      const saved = await saveAgent.mutateAsync({ id: agentId, agent: snapshot });
      dispatch({ type: "saved", agent: snapshot });
      setError(null);
      if (!agentId) {
        allowNextNavigation();
        void navigate(`/agents/${saved.id}`, { replace: true });
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async () => {
    const ok = await confirm(
      agentId
        ? {
            title: `Delete “${state.agent.name}”?`,
            description: "The agent file is removed from the server. This can't be undone.",
            confirmLabel: "Delete agent",
            tone: "danger",
          }
        : {
            title: "Discard this new agent?",
            description: "It hasn't been saved yet.",
            confirmLabel: "Discard",
            tone: "danger",
          },
    );
    if (!ok) return;
    try {
      if (agentId) await deleteAgent.mutateAsync(agentId);
      allowNextNavigation();
      void navigate("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const deselect = () => {
    dispatch({ type: "select", selection: NO_SELECTION });
  };

  useModKeyShortcut("s", () => {
    void save();
  });
  useEscapeKey(state.selection.kind !== "none", deselect);

  const context = useMemo(() => ({ state, dispatch }), [state]);
  const settingsOpen = state.selection.kind === "agent";

  return (
    <EditorContext value={context}>
      <div className={clsx(styles.editor, sidebarOpen && styles.withSidebar)}>
        <ReactFlowProvider>
          <FlowCanvas fitViewRequest={fitViewRequest} />
        </ReactFlowProvider>

        <div className={styles.top}>
          <EditorToolbar
            title={state.agent.name}
            dirty={state.dirty}
            saving={saveAgent.isPending}
            persisted={agentId !== null}
            settingsOpen={settingsOpen}
            onToggleSettings={() => {
              dispatch({
                type: "select",
                selection: settingsOpen ? NO_SELECTION : { kind: "agent" },
              });
            }}
            onAddNode={() => {
              dispatch({ type: "addNode", position: nextNodePosition(state.agent.nodes) });
            }}
            onAutoLayout={() => {
              dispatch({ type: "moveNodes", positions: autoLayout(state.agent.nodes) });
              setFitViewRequest((n) => n + 1);
            }}
            onDelete={() => {
              void remove();
            }}
            onSave={() => {
              void save();
            }}
          />
          {error && (
            <Banner
              className={styles.banner}
              onDismiss={() => {
                setError(null);
              }}
            >
              {error}
            </Banner>
          )}
        </div>

        <Inspector agentId={agentId} onClose={deselect} />
      </div>
    </EditorContext>
  );
}
