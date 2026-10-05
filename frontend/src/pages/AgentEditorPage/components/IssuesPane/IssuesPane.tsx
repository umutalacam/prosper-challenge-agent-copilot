import { clsx } from "clsx";
import { useEffect, useId, useState } from "react";
import { errorMessage, useAgentIssues, useBotStatus, useMarkIssuesSeen } from "@/shared/api";
import { useNow } from "@/shared/hooks/useNow";
import { formatRelative } from "@/shared/lib/time";
import type { AgentIssues, IssueFlag, IssueGroup, VersionIssues } from "@/shared/types/call";
import type { CopilotFix, CopilotGroupFix } from "@/shared/types/copilot";
import {
  Badge,
  Button,
  CheckIcon,
  CloseIcon,
  EmptyState,
  FlagIcon,
  IconButton,
  IssuesIcon,
  SparklesIcon,
} from "@/shared/ui";
import { callerName } from "../../lib/callerName";
import { groupLabel } from "../../lib/issueGroups";
import { CallAvatar } from "../CallAvatar/CallAvatar";
import { CallDetail } from "../CallDetail/CallDetail";
import styles from "./IssuesPane.module.scss";

const CLOCK_TICK_MS = 30_000;

export interface IssuesPaneProps {
  agentId: string;
  onClose: () => void;
  /** Hand an analysis finding to the copilot ("Fix with copilot"). */
  onFix?: (fix: CopilotFix) => void;
  /** Hand an issue group to the copilot: one fix across its calls. */
  onFixGroup?: (group: CopilotGroupFix) => void;
  /** The copilot is busy with another turn. */
  fixDisabled?: boolean;
}

/** How the pane's group fix buttons stand: who to call, and which were already sent. */
interface GroupFixing {
  onFix: (version: number, group: IssueGroup) => void;
  disabled: boolean;
  sent: ReadonlySet<string>;
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
export function IssuesPane({
  agentId,
  onClose,
  onFix,
  onFixGroup,
  fixDisabled = false,
}: IssuesPaneProps) {
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

  // Groups sent to the copilot while the pane is open; reopening it starts over.
  const [sentGroups, setSentGroups] = useState<ReadonlySet<string>>(() => new Set());
  const fixing: GroupFixing | null = onFixGroup
    ? {
        onFix: (version, group) => {
          setSentGroups((keys) => new Set(keys).add(groupKey(version, group)));
          onFixGroup({
            kind: group.kind,
            node: group.node,
            version,
            call_count: group.call_count,
            causes: group.causes,
          });
        },
        disabled: fixDisabled,
        sent: sentGroups,
      }
    : null;

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
                  fixing={fixing}
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
  fixing,
}: {
  version: VersionIssues;
  live: boolean;
  marks: NewMarks;
  now: Date;
  onOpen: (callId: string) => void;
  fixing: GroupFixing | null;
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
              version={version.version}
              fixing={fixing}
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
              version={version.version}
              fixing={fixing}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Group({
  group,
  newCount,
  now,
  onOpen,
  version,
  fixing,
}: {
  group: IssueGroup;
  newCount: number;
  now: Date;
  onOpen: (callId: string) => void;
  version: number;
  fixing: GroupFixing | null;
}) {
  const sent = fixing?.sent.has(groupKey(version, group)) ?? false;
  const unanalyzed = group.causes.length === 0;
  const [open, setOpen] = useState(false);
  const callsId = useId();
  return (
    <li className={styles.group}>
      {/* The row toggles its calls; the fix button sits beside it, not inside it. */}
      <div className={clsx(styles.groupHeader, open && styles.open)}>
        <button
          type="button"
          className={styles.summary}
          aria-expanded={open}
          aria-controls={callsId}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <span className={clsx(styles.dot, styles[group.kind])} aria-hidden="true" />
          <span className={styles.groupBody}>
            <span className={styles.label}>{groupLabel(group)}</span>
            <span className={styles.meta}>
              {group.call_count} {group.call_count === 1 ? "call" : "calls"} · last{" "}
              {formatRelative(new Date(group.last_at), now)}
            </span>
          </span>
          {newCount > 0 && <Badge tone="danger">{newCount} new</Badge>}
        </button>
        {fixing &&
          (sent ? (
            <Button size="sm" className={styles.groupFix} aria-label="Sent to copilot" disabled>
              <CheckIcon width={12} height={12} />
              Sent
            </Button>
          ) : (
            <Button
              size="sm"
              className={styles.groupFix}
              aria-label="Fix with copilot"
              disabled={fixing.disabled || unanalyzed}
              title={
                unanalyzed
                  ? "Waiting for these calls' analyses"
                  : fixing.disabled
                    ? "The copilot is busy"
                    : `One fix across these ${String(group.call_count)} calls`
              }
              onClick={() => {
                fixing.onFix(version, group);
              }}
            >
              <SparklesIcon width={12} height={12} />
              Fix
            </Button>
          ))}
      </div>
      {open && (
        <ul id={callsId} className={styles.calls}>
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
      )}
    </li>
  );
}
