import { BracesIcon, BrandLogo, Button, IssuesIcon, PhoneIcon, SettingsIcon } from "@/shared/ui";
import styles from "./EditorToolbar.module.scss";

const LOCKED_TITLE = "Read-only while the copilot is editing";

export interface EditorToolbarProps {
  title: string;
  dirty: boolean;
  saving: boolean;
  /** False for an agent that has never been saved. */
  persisted: boolean;
  settingsOpen: boolean;
  /** The copilot is editing: everything that would change the agent is disabled. */
  locked: boolean;
  /** The Call Log pane is open. */
  callsOpen: boolean;
  /** The agent has no calls (or issues) to show yet: it's never been saved. */
  callsDisabled: boolean;
  onToggleCalls: () => void;
  /** The Issues pane is open. */
  issuesOpen: boolean;
  /** New issues since they were last seen: the badge on the Issues toggle. */
  newIssues: number;
  onToggleIssues: () => void;
  onToggleSettings: () => void;
  onShowJson: () => void;
  onAddNode: () => void;
  onAutoLayout: () => void;
  onDelete: () => void;
  onSave: () => void;
}

export function EditorToolbar({
  title,
  dirty,
  saving,
  persisted,
  settingsOpen,
  locked,
  callsOpen,
  callsDisabled,
  onToggleCalls,
  issuesOpen,
  newIssues,
  onToggleIssues,
  onToggleSettings,
  onShowJson,
  onAddNode,
  onAutoLayout,
  onDelete,
  onSave,
}: EditorToolbarProps) {
  return (
    <header className={styles.toolbar}>
      <BrandLogo compact />
      {/* The agent's name lives in its settings; the heading keeps the page labelled. */}
      <h1 className={styles.visuallyHidden}>{title || "Untitled agent"}</h1>

      <span className={styles.divider} aria-hidden="true" />
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={settingsOpen}
        className={styles.settings}
        onClick={onToggleSettings}
        disabled={locked}
        title={locked ? LOCKED_TITLE : undefined}
      >
        <SettingsIcon width={16} height={16} />
        Agent settings
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        className={styles.settings}
        onClick={onShowJson}
        disabled={locked}
        title={locked ? LOCKED_TITLE : undefined}
      >
        <BracesIcon width={16} height={16} />
        JSON
      </Button>
      {/* Read-only, so it stays available while the copilot edits. */}
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={callsOpen}
        className={styles.settings}
        onClick={onToggleCalls}
        disabled={callsDisabled}
        title={callsDisabled ? "Save the agent first" : "Call Log"}
      >
        <PhoneIcon width={16} height={16} />
        Calls
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={issuesOpen}
        aria-label={newIssues > 0 ? `Issues, ${String(newIssues)} new` : undefined}
        className={styles.settings}
        onClick={onToggleIssues}
        disabled={callsDisabled}
        title={callsDisabled ? "Save the agent first" : "Issues across this agent's calls"}
      >
        <IssuesIcon width={16} height={16} />
        Issues
        {newIssues > 0 && (
          <span className={styles.count} aria-hidden="true">
            {newIssues > 99 ? "99+" : newIssues}
          </span>
        )}
      </Button>

      <span className={styles.divider} aria-hidden="true" />

      <Button
        size="sm"
        onClick={onAddNode}
        disabled={locked}
        title={locked ? LOCKED_TITLE : undefined}
      >
        + Node
      </Button>
      <Button
        size="sm"
        onClick={onAutoLayout}
        disabled={locked}
        title={locked ? LOCKED_TITLE : undefined}
      >
        Auto-layout
      </Button>

      <span className={styles.divider} aria-hidden="true" />

      <Button
        size="sm"
        variant="danger"
        onClick={onDelete}
        disabled={locked}
        title={locked ? LOCKED_TITLE : undefined}
      >
        {persisted ? "Delete agent" : "Discard"}
      </Button>
      <Button
        size="sm"
        variant="primary"
        onClick={onSave}
        disabled={saving || !dirty}
        title="Save (⌘S)"
      >
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </Button>
    </header>
  );
}
