import { Button, SettingsIcon } from "@/shared/ui";
import styles from "./EditorToolbar.module.scss";

export interface EditorToolbarProps {
  title: string;
  dirty: boolean;
  saving: boolean;
  /** False for an agent that has never been saved. */
  persisted: boolean;
  settingsOpen: boolean;
  onToggleSettings: () => void;
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
  onToggleSettings,
  onAddNode,
  onAutoLayout,
  onDelete,
  onSave,
}: EditorToolbarProps) {
  return (
    <header className={styles.toolbar}>
      <h1 className={styles.title}>
        <span className={styles.titleText}>{title || "Untitled agent"}</span>
        {dirty && <span className={styles.dirtyDot} role="status" aria-label="Unsaved changes" />}
      </h1>
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={settingsOpen}
        className={styles.settings}
        onClick={onToggleSettings}
      >
        <SettingsIcon width={16} height={16} />
        Agent settings
      </Button>

      <span className={styles.divider} aria-hidden="true" />

      <Button size="sm" onClick={onAddNode}>
        + Node
      </Button>
      <Button size="sm" onClick={onAutoLayout}>
        Auto-layout
      </Button>

      <span className={styles.divider} aria-hidden="true" />

      <Button size="sm" variant="danger" onClick={onDelete}>
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
