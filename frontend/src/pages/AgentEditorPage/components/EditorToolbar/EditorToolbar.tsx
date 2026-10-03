import { Button } from "@/shared/ui";
import styles from "./EditorToolbar.module.scss";

export interface EditorToolbarProps {
  title: string;
  dirty: boolean;
  saving: boolean;
  /** False for an agent that has never been saved. */
  persisted: boolean;
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
      <div className={styles.group}>
        <Button onClick={onAddNode}>+ Node</Button>
        <Button onClick={onAutoLayout}>Auto-layout</Button>
      </div>
      <div className={styles.spacer} />
      <div className={styles.group}>
        <Button variant="danger" onClick={onDelete}>
          {persisted ? "Delete agent" : "Discard"}
        </Button>
        <Button variant="primary" onClick={onSave} disabled={saving || !dirty} title="Save (⌘S)">
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
      </div>
    </header>
  );
}
