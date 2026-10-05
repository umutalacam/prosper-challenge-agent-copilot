import { useId, useState } from "react";
import { errorMessage, useAgentCalls } from "@/shared/api";
import type { CallOutcome } from "@/shared/types/call";
import { CloseIcon, EmptyState, IconButton, PhoneIcon } from "@/shared/ui";
import { useNow } from "../../hooks/useNow";
import { OUTCOMES } from "../../lib/callOutcomes";
import { CallDetail } from "../CallDetail/CallDetail";
import { CallList } from "../CallList/CallList";
import { OutcomeFilter } from "../OutcomeFilter/OutcomeFilter";
import styles from "./CallLogPane.module.scss";

/** How often "34 minutes ago" is retold. */
const CLOCK_TICK_MS = 30_000;

export interface CallLogPaneProps {
  agentId: string;
  onClose: () => void;
}

/**
 * The agent's Call Log, in the editor's right-hand spot: recent calls, newest
 * first, filtered by outcome; a call opens to its transcript. Read-only, so it
 * stays usable while the copilot edits.
 */
export function CallLogPane({ agentId, onClose }: CallLogPaneProps) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const now = useNow(CLOCK_TICK_MS);
  const titleId = useId();

  return (
    <aside className={styles.pane} aria-labelledby={titleId}>
      <header className={styles.header}>
        <PhoneIcon className={styles.mark} width={16} height={16} />
        <h2 id={titleId} className={styles.title}>
          Call Log
        </h2>
        <IconButton label="Close the call log (Esc)" onClick={onClose}>
          <CloseIcon width={16} height={16} />
        </IconButton>
      </header>

      <div className={styles.body}>
        {openCallId ? (
          <CallDetail
            agentId={agentId}
            callId={openCallId}
            now={now}
            onBack={() => {
              setOpenCallId(null);
            }}
          />
        ) : (
          <div className={styles.scroll}>
            <OutcomeFilter value={outcome} onChange={setOutcome} />
            <Calls agentId={agentId} outcome={outcome} now={now} onOpen={setOpenCallId} />
          </div>
        )}
      </div>
    </aside>
  );
}

function Calls({
  agentId,
  outcome,
  now,
  onOpen,
}: {
  agentId: string;
  outcome: CallOutcome | null;
  now: Date;
  onOpen: (callId: string) => void;
}) {
  const calls = useAgentCalls(agentId, outcome ? [outcome] : []);
  if (calls.isPending) return <EmptyState title="Loading calls…" />;
  if (calls.isError) {
    return <EmptyState title="Couldn't load calls" description={errorMessage(calls.error)} />;
  }
  if (calls.data.length === 0) {
    return outcome ? (
      <EmptyState title={`No ${OUTCOMES[outcome].label.toLowerCase()} calls`} />
    ) : (
      <EmptyState
        title="No calls yet"
        description="Deploy this agent and call it: every call shows up here, with its transcript."
      />
    );
  }
  return <CallList calls={calls.data} now={now} onOpen={onOpen} />;
}
