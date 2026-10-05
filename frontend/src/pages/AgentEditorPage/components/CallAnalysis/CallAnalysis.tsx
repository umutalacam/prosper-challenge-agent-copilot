import type { CallAnalysis as Analysis, CallFinding } from "@/shared/types/call";
import { Button, CheckIcon, SparklesIcon } from "@/shared/ui";
import { findingKey } from "../../lib/callFindings";
import styles from "./CallAnalysis.module.scss";

const NONE_SENT: ReadonlySet<string> = new Set();

export interface CallAnalysisProps {
  analysis: Analysis;
  /** Hand a finding to the copilot; without it there's no fix button. */
  onFix?: (finding: CallFinding) => void;
  /** The copilot is busy with another turn. */
  fixDisabled?: boolean;
  /** Findings already handed to the copilot (by `findingKey`): their button is spent. */
  sent?: ReadonlySet<string>;
}

/**
 * The AI's take on a call with issues: what went wrong, and per issue why and
 * what to change in the agent. Written after the call, so it may still be pending.
 */
export function CallAnalysis({
  analysis,
  onFix,
  fixDisabled = false,
  sent = NONE_SENT,
}: CallAnalysisProps) {
  if (analysis.status === "pending") {
    return (
      <p className={styles.pending} aria-live="polite">
        Analyzing this call…
      </p>
    );
  }
  if (analysis.status === "failed") {
    return (
      <p className={styles.muted} title={analysis.error ?? undefined}>
        Couldn&apos;t analyze this call.
      </p>
    );
  }
  return (
    <div className={styles.analysis} aria-live="polite">
      {analysis.summary && <p className={styles.summary}>{analysis.summary}</p>}
      {analysis.findings.length > 0 && (
        <ul className={styles.findings}>
          {analysis.findings.map((finding, i) => (
            <li key={`${finding.node ?? "call"}-${String(i)}`} className={styles.finding}>
              {finding.node && <span className={styles.node}>{finding.node}</span>}
              <p>{finding.cause}</p>
              {finding.suggestion && (
                <p className={styles.suggestion}>
                  <span className={styles.label}>Try:</span> {finding.suggestion}
                </p>
              )}
              {/* No suggestion: the analysis found nothing to change here. */}
              {onFix &&
                finding.suggestion &&
                (sent.has(findingKey(finding)) ? (
                  <Button size="sm" className={styles.fix} disabled>
                    <CheckIcon width={12} height={12} />
                    Sent to copilot
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className={styles.fix}
                    disabled={fixDisabled}
                    title={fixDisabled ? "The copilot is busy" : undefined}
                    onClick={() => {
                      onFix(finding);
                    }}
                  >
                    <SparklesIcon width={12} height={12} />
                    Fix with copilot
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
