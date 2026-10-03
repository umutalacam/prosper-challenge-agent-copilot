import { Field, Input, Select, TextArea } from "@/shared/ui";
import { useEditor } from "../../state/editorContext";
import type { AgentPatch } from "../../state/types";
import { InspectorForm } from "../InspectorForm/InspectorForm";
import styles from "./AgentSettingsForm.module.scss";

export interface AgentSettingsFormProps {
  /** The saved agent's id, used for the "run it" hint; null while unsaved. */
  agentId: string | null;
}

export function AgentSettingsForm({ agentId }: AgentSettingsFormProps) {
  const { state, dispatch } = useEditor();
  const { agent } = state;
  const update = (patch: AgentPatch) => {
    dispatch({ type: "updateAgent", patch });
  };

  return (
    <InspectorForm title="Agent">
      <Field label="Name">
        {(p) => (
          <Input
            {...p}
            value={agent.name}
            onChange={(e) => {
              update({ name: e.target.value });
            }}
          />
        )}
      </Field>

      <Field
        label="Personality"
        hint="The system prompt. Applies to every node unless the node overrides it."
      >
        {(p) => (
          <TextArea
            {...p}
            rows={8}
            value={agent.persona}
            placeholder="You are a warm, efficient scheduling assistant…"
            onChange={(e) => {
              update({ persona: e.target.value });
            }}
          />
        )}
      </Field>

      <Field label="Start node">
        {(p) => (
          <Select
            {...p}
            value={agent.initial_node}
            options={agent.nodes.map((n) => ({ value: n.name }))}
            onChange={(initial_node) => {
              update({ initial_node });
            }}
          />
        )}
      </Field>

      <Field label="LLM model">
        {(p) => (
          <Input
            {...p}
            value={agent.model ?? ""}
            placeholder="gpt-4o"
            onChange={(e) => {
              update({ model: e.target.value || undefined });
            }}
          />
        )}
      </Field>

      <Field label="ElevenLabs voice ID">
        {(p) => (
          <Input
            {...p}
            value={agent.voice_id ?? ""}
            placeholder="21m00Tcm4TlvDq8ikWAM"
            onChange={(e) => {
              update({ voice_id: e.target.value || undefined });
            }}
          />
        )}
      </Field>

      <div className={styles.callout}>
        {agentId ? (
          <>
            Test it in the voice bot:
            <code className={styles.command}>AGENT_ID={agentId} make run</code>
          </>
        ) : (
          "Save this agent to test it in the voice bot."
        )}
      </div>
      <p className={styles.hint}>Select a node or action on the canvas to edit it.</p>
    </InspectorForm>
  );
}
