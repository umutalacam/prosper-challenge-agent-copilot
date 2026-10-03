import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Agent } from "@/shared/types/agent";
import { Button } from "@/shared/ui";
import { formatAgentJson, parseAgentJson } from "../../lib/agentJson";
import styles from "./JsonDialog.module.scss";

const INDENT = "  ";

export interface JsonDialogProps {
  agent: Agent;
  /** The edited document; it replaces the working copy (save as usual afterwards). */
  onApply: (agent: Agent) => void;
  onClose: () => void;
}

/**
 * The agent as raw JSON in a large modal editor (line numbers, Tab indents,
 * Format). Mount it to open it: each opening starts from the current working
 * copy. Built on the native <dialog>, like ConfirmDialog (focus trap + Escape).
 */
export function JsonDialog({ agent, onApply, onClose }: JsonDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const [original] = useState(() => formatAgentJson(agent));
  const [text, setText] = useState(original);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const titleId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const lineCount = text.split("\n").length;
  const edited = text !== original;

  const change = (next: string) => {
    setText(next);
    setError(null);
    setCopied(false);
  };

  const apply = () => {
    const result = parseAgentJson(text);
    if (result.ok) onApply(result.agent);
    else setError(result.error);
  };

  // Pretty-print what's there now (only if it parses).
  const format = () => {
    try {
      change(JSON.stringify(JSON.parse(text), null, 2));
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      apply();
    } else if (e.key === "Tab" && !e.shiftKey) {
      // Indent like a code editor. Escape still closes the dialog.
      e.preventDefault();
      const box = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = box;
      change(text.slice(0, start) + INDENT + text.slice(end));
      requestAnimationFrame(() => {
        box.selectionStart = box.selectionEnd = start + INDENT.length;
      });
    }
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      // Escape fires `cancel`; route it through onClose so the parent's state decides.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          Agent JSON
        </h2>
        <p className={styles.description}>
          Edit the agent as the backend stores it. Apply updates the editor; save to store it.
        </p>
      </header>

      <div className={styles.editor} data-invalid={error !== null || undefined}>
        {/* Line numbers, scrolled along with the text. */}
        <pre ref={gutterRef} className={styles.gutter} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
        </pre>
        <textarea
          className={styles.code}
          value={text}
          spellCheck={false}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Agent JSON"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            change(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
        />
      </div>

      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.status}>
          {lineCount} lines{edited ? " · edited" : ""} · Tab indents · ⌘↵ applies
        </p>
      )}

      <div className={styles.actions}>
        <Button variant="ghost" onClick={format}>
          Format
        </Button>
        <Button variant="ghost" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <span className={styles.spacer} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={apply} disabled={!edited} title="Apply (⌘↵)">
          Apply
        </Button>
      </div>
    </dialog>
  );
}
