import type { CallAnalysis as Analysis } from "@/shared/types/call";
import styles from "./CallAnalysis.module.scss";

export interface CallAnalysisProps {
  analysis: Analysis;
}

/**
 * The AI's take on a call with issues: what went wrong, and per issue why and
 * what to change in the agent. Written after the call, so it may still be pending.
 */
export function CallAnalysis({ analysis }: CallAnalysisProps) {
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
