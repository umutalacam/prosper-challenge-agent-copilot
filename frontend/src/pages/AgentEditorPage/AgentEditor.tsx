import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, errorMessage, useDeleteAgent, useSaveAgent } from "@/shared/api";
import type { Agent } from "@/shared/types/agent";
import { Banner, useConfirm } from "@/shared/ui";
import { CopilotCard } from "./components/CopilotCard/CopilotCard";
import { CopilotPrompt } from "./components/CopilotPrompt/CopilotPrompt";
import { EditorToolbar } from "./components/EditorToolbar/EditorToolbar";
import { FlowCanvas } from "./components/FlowCanvas/FlowCanvas";
import { Inspector } from "./components/Inspector/Inspector";
import { JsonDialog } from "./components/JsonDialog/JsonDialog";
import { useCopilot } from "./hooks/useCopilot";
import { useEditHighlights } from "./hooks/useEditHighlights";
import { useKeyPress } from "./hooks/useKeyPress";
import { useModKeyShortcut } from "./hooks/useKeyboardShortcut";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";
import { autoLayout, nextNodePosition, withPositions } from "./lib/autoLayout";
import { diffAgents } from "./lib/agentDiff";
import { EditorContext } from "./state/editorContext";
import { createEditorState, editorReducer, NO_SELECTION } from "./state/editorReducer";
import styles from "./AgentEditor.module.scss";

export type AgentEditorProps =
  /** A new, never-saved agent. */
  | { agentId: null; initialAgent: Agent; initialVersion?: undefined }
  /** A stored agent, at the version it was loaded at. */
  | { agentId: string; initialAgent: Agent; initialVersion: number };

const CONFLICT_MESSAGE =
  "Someone else saved this agent since you opened it, so your save was blocked to avoid " +
  "overwriting their changes. Copy anything you need, then reload to get the latest version.";

/**
 * Owns one agent's working copy (the reducer) plus save/delete, and lays out the
 * editor: a full-bleed canvas with the toolbar and inspector card floating over it.
 * Mount it with a `key` per agent so switching agents starts from a fresh state.
 */
export function AgentEditor({ agentId, initialAgent, initialVersion }: AgentEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, initialAgent, (agent) =>
    // A brand-new agent opens on its settings so the first thing you do is name it.
    createEditorState(withPositions(agent), agentId ? NO_SELECTION : { kind: "agent" }),
  );
  // The stored version this working copy is based on; sent as If-Match on save.
  const [version, setVersion] = useState(initialVersion);
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [revealRequest, setRevealRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [copilotDraft, setCopilotDraft] = useState("");
  const [copilotCardOpen, setCopilotCardOpen] = useState(true);
  const copilotInputRef = useRef<HTMLTextAreaElement>(null);
  // Canvas effects for the copilot's edits: animate what each touched and glide to it.
  const { highlights, focusRequest, show: showEdit } = useEditHighlights();

  const navigate = useNavigate();
  const confirm = useConfirm();
  const saveAgent = useSaveAgent();
  const deleteAgent = useDeleteAgent();
  const allowNextNavigation = useUnsavedChangesGuard(state.dirty);

  // The copilot reads the working copy when a prompt is sent and writes each of its
  // edits back into it, live and unsaved (save as usual).
  const agentRef = useRef(state.agent);
  useEffect(() => {
    agentRef.current = state.agent;
  });
  // The agent as of the copilot's previous edit in this turn (events can arrive
  // faster than renders, so diffing against state.agent could miss one).
  const copilotBaseRef = useRef<Agent | null>(null);
  const copilot = useCopilot({
    getAgent: useCallback(() => agentRef.current, []),
    onAgent: useCallback(
      (edited: Agent) => {
        const previous = copilotBaseRef.current ?? agentRef.current;
        const next = withPositions(edited);
        copilotBaseRef.current = next;
        dispatch({ type: "copilotEdit", agent: next });
        showEdit(diffAgents(previous, next), next);
      },
      [showEdit],
    ),
    onTurnEnd: useCallback((changed: boolean) => {
      copilotBaseRef.current = null;
      // Step back to show the whole result.
      if (changed) setRevealRequest((n) => n + 1);
    }, []),
  });
  const lastTurn = copilot.turns.at(-1);

  // Read-only while the copilot edits: its edits would overwrite hand edits mid-turn.
  useEffect(() => {
    dispatch({ type: "setLocked", locked: copilot.running });
  }, [copilot.running]);

  const sendToCopilot = () => {
    setCopilotCardOpen(true);
    void copilot.send(copilotDraft);
    setCopilotDraft("");
  };

  const save = async () => {
    if (!state.dirty || saveAgent.isPending) return;
    const snapshot = state.agent;
    try {
      const saved = await saveAgent.mutateAsync(
        agentId === null || version === undefined
          ? { id: null, agent: snapshot }
          : { id: agentId, agent: snapshot, version },
      );
      dispatch({ type: "saved", agent: snapshot });
      setVersion(saved.version);
      setError(null);
      if (!agentId) {
        allowNextNavigation();
        void navigate(`/agents/${saved.id}`, { replace: true });
      }
    } catch (e) {
      setError(e instanceof ApiError && e.isConflict ? CONFLICT_MESSAGE : errorMessage(e));
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
  useKeyPress(["Escape"], state.selection.kind !== "none", deselect);

  // Delete / Backspace remove the selected node or action, through the reducer so
  // cascades and guards apply (inbound actions go too; the start node stays).
  const { selection } = state;
  const deletable =
    !state.locked &&
    (selection.kind === "action" ||
      (selection.kind === "node" && selection.node !== state.agent.initial_node));
  useKeyPress(["Delete", "Backspace"], deletable, () => {
    if (selection.kind === "node") dispatch({ type: "deleteNode", node: selection.node });
    if (selection.kind === "action") {
      dispatch({ type: "deleteAction", node: selection.node, index: selection.index });
    }
  });

  const context = useMemo(() => ({ state, dispatch }), [state]);
  const settingsOpen = state.selection.kind === "agent";

  return (
    <EditorContext value={context}>
      <div className={styles.editor}>
        <ReactFlowProvider>
          <FlowCanvas
            fitViewRequest={fitViewRequest}
            revealRequest={revealRequest}
            focusRequest={focusRequest}
            highlights={highlights}
            working={copilot.running}
          />
        </ReactFlowProvider>

        <div className={styles.top}>
          <EditorToolbar
            title={state.agent.name}
            dirty={state.dirty}
            saving={saveAgent.isPending}
            persisted={agentId !== null}
            settingsOpen={settingsOpen}
            locked={state.locked}
            onToggleSettings={() => {
              dispatch({
                type: "select",
                selection: settingsOpen ? NO_SELECTION : { kind: "agent" },
              });
            }}
            onShowJson={() => {
              setJsonOpen(true);
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

        {copilotCardOpen && (
          <CopilotCard
            turns={copilot.turns}
            onAnswer={(message) => {
              void copilot.send(message);
            }}
            onClose={() => {
              setCopilotCardOpen(false);
            }}
          />
        )}
        <CopilotPrompt
          ref={copilotInputRef}
          value={copilotDraft}
          onChange={setCopilotDraft}
          onSend={sendToCopilot}
          onStop={copilot.stop}
          running={copilot.running}
          awaitingAnswer={lastTurn?.status === "done" && Boolean(lastTurn.questions?.length)}
        />

        {jsonOpen && (
          <JsonDialog
            agent={state.agent}
            onApply={(agent) => {
              // Lay out any nodes the JSON added without a position.
              dispatch({ type: "replaceAgent", agent: withPositions(agent) });
              setJsonOpen(false);
            }}
            onClose={() => {
              setJsonOpen(false);
            }}
          />
        )}
      </div>
    </EditorContext>
  );
}
