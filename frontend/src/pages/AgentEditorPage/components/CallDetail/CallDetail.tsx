import { useState } from "react";
import { errorMessage, useCall } from "@/shared/api";
import type { CopilotFix } from "@/shared/types/copilot";
import { ArrowLeftIcon, Button, ChatIcon } from "@/shared/ui";
import { CallOverview } from "../CallOverview/CallOverview";
import { CallTranscript } from "../CallTranscript/CallTranscript";
import styles from "./CallDetail.module.scss";

export interface CallDetailProps {
  agentId: string;
  callId: string;
  /** The clock relative times are told against. */
  now: Date;
  /** Back to the list. */
  onBack: () => void;
  /** Hand an analysis finding to the copilot ("Fix with copilot"). */
  onFix?: (fix: CopilotFix) => void;
  /** The copilot is busy with another turn. */
  fixDisabled?: boolean;
}

/**
 * One call: its overview first, with the transcript button pinned to the bottom
 * of the pane; then the transcript. Back steps out one level.
 */
export function CallDetail({ agentId, callId, now, onBack, onFix, fixDisabled }: CallDetailProps) {
  const call = useCall(agentId, callId);
  const [view, setView] = useState<"overview" | "transcript">("overview");
  const inTranscript = view === "transcript";
  const said = call.data?.transcript.length ?? 0;

  return (
    <div className={styles.detail}>
      <div className={styles.scroll}>
        <Button
          variant="ghost"
          size="sm"
          className={styles.back}
          onClick={() => {
            if (inTranscript) setView("overview");
            else onBack();
          }}
        >
          <ArrowLeftIcon width={14} height={14} />
          {inTranscript ? "Overview" : "All calls"}
        </Button>
        {call.isPending ? (
          <p className={styles.muted}>Loading the call…</p>
        ) : call.isError ? (
          <p className={styles.error} role="alert">
            Couldn&apos;t load the call: {errorMessage(call.error)}
          </p>
        ) : inTranscript ? (
          <CallTranscript turns={call.data.transcript} />
        ) : (
          <CallOverview call={call.data} now={now} onFix={onFix} fixDisabled={fixDisabled} />
        )}
      </div>
      {call.isSuccess && !inTranscript && (
        <footer className={styles.footer}>
          <Button
            variant="primary"
            block
            onClick={() => {
              setView("transcript");
            }}
          >
            <ChatIcon width={16} height={16} />
            View transcript ({said} {said === 1 ? "message" : "messages"})
          </Button>
        </footer>
      )}
    </div>
  );
}
