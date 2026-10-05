import { clsx } from "clsx";
import { useEffect, useId, useState } from "react";
import { errorMessage, useAgentIssues, useBotStatus, useMarkIssuesSeen } from "@/shared/api";
import { useNow } from "@/shared/hooks/useNow";
import { formatRelative } from "@/shared/lib/time";
import type { AgentIssues, IssueFlag, IssueGroup, VersionIssues } from "@/shared/types/call";
import type { CopilotFix } from "@/shared/types/copilot";
import { Badge, CloseIcon, EmptyState, FlagIcon, IconButton, IssuesIcon } from "@/shared/ui";
import { callerName } from "../../lib/callerName";
import { CallAvatar } from "../CallAvatar/CallAvatar";
import { CallDetail } from "../CallDetail/CallDetail";
import styles from "./IssuesPane.module.scss";

const CLOCK_TICK_MS = 30_000;

export interface IssuesPaneProps {
  agentId: string;
  onClose: () => void;
  /** Hand an analysis finding to the copilot ("Fix with copilot"). */
  onFix?: (fix: CopilotFix) => void;
  /** The copilot is busy with another turn. */
  fixDisabled?: boolean;
}

/** What was new while the pane is open: group key → its new calls, flag key → 1. */
type NewMarks = ReadonlyMap<string, number>;

const groupKey = (version: number, group: IssueGroup) =>
  `${String(version)}:${group.kind}:${group.node ?? ""}`;
const flagKey = (flag: IssueFlag) => `flag:${flag.call_id}:${flag.created_at}`;

/** The new items in a load, to keep highlighting them after they're marked seen. */
function newMarksOf(issues: AgentIssues | undefined): Map<string, number> {
  const marks = new Map<string, number>();
  for (const version of issues?.versions ?? []) {
    for (const group of version.groups) {
      if (group.new_count > 0) marks.set(groupKey(version.version, group), group.new_count);
    }
    for (const flag of version.flags) if (flag.new) marks.set(flagKey(flag), 1);
  }
  return marks;
}

/**
 * The agent's issues across its calls, divided by version, in the editor's
 * right-hand spot: what got stuck, failed or ran long at which node, and what
 * customers flagged. Opening it marks the issues seen (the toolbar badge clears);
 * what was new stays highlighted while it's open. A call opens right here.
 */
export function IssuesPane({ agentId, onClose, onFix, fixDisabled }: IssuesPaneProps) {
  const issues = useAgentIssues(agentId);
  const { mutate: markSeen } = useMarkIssuesSeen(agentId);
  const deployed = useBotStatus().data;
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const now = useNow(CLOCK_TICK_MS);
  const titleId = useId();

  // Collect what's new as loads arrive (adjusted while rendering, not in an effect).
  const [marks, setMarks] = useState<NewMarks>(() => newMarksOf(issues.data));
  const [lastData, setLastData] = useState(issues.data);
  if (issues.data !== lastData) {
    setLastData(issues.data);
    const fresh = newMarksOf(issues.data);
    if ([...fresh.keys()].some((key) => !marks.has(key))) setMarks(new Map([...marks, ...fresh]));
  }
  // While it's open, anything new has been seen.
  const newCount = issues.data?.new_count ?? 0;
  useEffect(() => {
    if (newCount > 0) markSeen();
  }, [newCount, markSeen]);

  const liveVersion = deployed?.agent_id === agentId ? deployed.version : null;

  return (
    <aside className={styles.pane} aria-labelledby={titleId}>
      <header className={styles.header}>
        <IssuesIcon className={styles.mark} width={16} height={16} />
        <h2 id={titleId} className={styles.title}>
          Issues
        </h2>
        <IconButton label="Close issues (Esc)" onClick={onClose}>
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
            backLabel="All issues"
            onFix={onFix}
            fixDisabled={fixDisabled}
          />
        ) : (
          <div className={styles.scroll}>
            {issues.isPending ? (
              <EmptyState title="Loading issues…" />
            ) : issues.isError ? (
              <EmptyState title="Couldn't load issues" description={errorMessage(issues.error)} />
            ) : issues.data.versions.length === 0 ? (
              <EmptyState
                title="No issues yet"
                description="Calls that get stuck, fail or are flagged by customers show up here, by version."
              />
            ) : (
              issues.data.versions.map((version) => (
                <Version
                  key={version.version}
                  version={version}
                  live={version.version === liveVersion}
                  marks={marks}
                  now={now}
                  onOpen={setOpenCallId}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function Version({
  version,
  live,
  marks,
  now,
  onOpen,
}: {
  version: VersionIssues;
  live: boolean;
  marks: NewMarks;
  now: Date;
  onOpen: (callId: string) => void;
}) {
  const failures = version.groups.filter((g) => g.kind !== "long_stay");
  const notes = version.groups.filter((g) => g.kind === "long_stay");
  const clean = version.groups.length === 0 && version.flags.length === 0;
  const headingId = useId();
  const calls = (n: number) => `${String(n)} ${n === 1 ? "call" : "calls"}`;

  return (
    <section className={styles.version} aria-labelledby={headingId}>
      <header className={styles.versionHeader}>
        <h3 id={headingId} className={styles.versionName}>
          v{version.version}
        </h3>
        {live && <Badge tone="success">● Deployed</Badge>}
        <span className={styles.meta}>
          {calls(version.call_count)} · {version.calls_with_issues} with issues
        </span>
      </header>

      {clean ? (
        <p className={styles.muted}>No issues in these calls.</p>
      ) : (
        <ul className={styles.items}>
          {failures.map((group) => (
            <Group
              key={groupKey(version.version, group)}
              group={group}
              newCount={marks.get(groupKey(version.version, group)) ?? 0}
              now={now}
              onOpen={onOpen}
            />
          ))}
          {version.flags.map((flag) => (
            <li key={flagKey(flag)}>
              <button
                type="button"
                className={styles.flag}
                onClick={() => {
                  onOpen(flag.call_id);
                }}
              >
                <FlagIcon className={styles.flagMark} width={12} height={12} />
                <span className={styles.flagBody}>
                  <span className={styles.flagReason}>{flag.reason}</span>
                  <span className={styles.meta}>
                    {callerName(flag.call_id)} · flagged{" "}
                    {formatRelative(new Date(flag.created_at), now)}
                  </span>
                </span>
                {marks.has(flagKey(flag)) && <Badge tone="danger">New</Badge>}
              </button>
            </li>
          ))}
          {notes.map((group) => (
            <Group
              key={groupKey(version.version, group)}
              group={group}
              newCount={0} // long stays are notes: they never count as new
              now={now}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** How a group reads: what happened and where. */
function groupLabel({ kind, node }: IssueGroup): string {
  const where = node ? ` in ${node}` : "";
  switch (kind) {
    case "stuck":
      return `Stuck${where}`;
    case "error":
      return `Errors${where}`;
    case "long_stay":
      return `Long stays${where}`;
  }
}

function Group({
  group,
  newCount,
  now,
  onOpen,
}: {
  group: IssueGroup;
  newCount: number;
  now: Date;
  onOpen: (callId: string) => void;
}) {
  return (
    <li>
      <details className={styles.group}>
        <summary className={styles.summary}>
          <span className={clsx(styles.dot, styles[group.kind])} aria-hidden="true" />
          <span className={styles.groupBody}>
            <span className={styles.label}>{groupLabel(group)}</span>
            <span className={styles.meta}>
              {group.call_count} {group.call_count === 1 ? "call" : "calls"} · last{" "}
              {formatRelative(new Date(group.last_at), now)}
            </span>
          </span>
          {newCount > 0 && <Badge tone="danger">{newCount} new</Badge>}
        </summary>
        <ul className={styles.calls}>
          {group.calls.map((call) => (
            <li key={call.id}>
              <button
                type="button"
                className={styles.call}
                onClick={() => {
                  onOpen(call.id);
                }}
              >
                <CallAvatar seed={call.id} size={20} />
                <span className={styles.callName}>{callerName(call.id)}</span>
                <time className={styles.meta} dateTime={call.ended_at}>
                  {formatRelative(new Date(call.ended_at), now)}
                </time>
              </button>
            </li>
          ))}
          {group.call_count > group.calls.length && (
            <li className={styles.muted}>
              and {group.call_count - group.calls.length} earlier — see the Call Log
            </li>
          )}
        </ul>
      </details>
    </li>
  );
}
