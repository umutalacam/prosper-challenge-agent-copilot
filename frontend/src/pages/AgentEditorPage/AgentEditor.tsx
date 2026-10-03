import { ReactFlowProvider } from "@xyflow/react";
import { useMemo, useReducer, useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage, useDeleteAgent, useSaveAgent } from "@/shared/api";
import type { Agent } from "@/shared/types/agent";
import { Banner, useConfirm } from "@/shared/ui";
import { EditorToolbar } from "./components/EditorToolbar/EditorToolbar";
import { FlowCanvas } from "./components/FlowCanvas/FlowCanvas";
import { Inspector } from "./components/Inspector/Inspector";
import { useModKeyShortcut } from "./hooks/useKeyboardShortcut";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";
import { autoLayout, nextNodePosition, withPositions } from "./lib/autoLayout";
import { EditorContext } from "./state/editorContext";
import { createEditorState, editorReducer } from "./state/editorReducer";
import styles from "./AgentEditor.module.scss";

export interface AgentEditorProps {
  /** The stored agent's id, or null for a new, never-saved agent. */
  agentId: string | null;
  initialAgent: Agent;
}

/**
 * Owns one agent's working copy (the reducer) plus save/delete. Mount it with a
 * `key` per agent so switching agents starts from a fresh state.
 */
export function AgentEditor({ agentId, initialAgent }: AgentEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, initialAgent, (agent) =>
    createEditorState(withPositions(agent)),
  );
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  useModKeyShortcut("s", () => {
    void save();
  });

  const context = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <EditorContext value={context}>
      <div className={styles.editor}>
        <EditorToolbar
          title={state.agent.name}
          dirty={state.dirty}
          saving={saveAgent.isPending}
          persisted={agentId !== null}
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
            onDismiss={() => {
              setError(null);
            }}
          >
            {error}
          </Banner>
        )}
        <div className={styles.body}>
          <ReactFlowProvider>
            <FlowCanvas fitViewRequest={fitViewRequest} />
          </ReactFlowProvider>
          <Inspector agentId={agentId} />
        </div>
      </div>
    </EditorContext>
  );
}
