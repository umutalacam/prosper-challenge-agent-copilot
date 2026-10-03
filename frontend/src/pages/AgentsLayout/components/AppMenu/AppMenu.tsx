import { clsx } from "clsx";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router";
import { errorMessage, useAgentList, useBotStatus } from "@/shared/api";
import type { AgentSummary } from "@/shared/types/agent";
import { ArrowLeftIcon, Badge, MenuIcon, PhoneIcon, RobotIcon } from "@/shared/ui";
import { useTestCall } from "../../hooks/useTestCall";
import styles from "./AppMenu.module.scss";

const RECENT_LIMIT = 5;

/** The agents saved most recently: the ones being worked on. */
function recentAgents(agents: AgentSummary[] | undefined): AgentSummary[] {
  return [...(agents ?? [])]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, RECENT_LIMIT);
}

/** Enabled items, in order, for arrow-key navigation. */
function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
}

/**
 * The editor's top-left hamburger menu (Excalidraw-style): back to the agent list,
 * a test call of the open agent, and the recently edited agents.
 */
export function AppMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const recentLabelId = useId();

  // Undefined on /agents/new: an unsaved agent can't take a call yet.
  const { agentId } = useParams();
  const agents = useAgentList();
  const runningAgentId = useBotStatus().data?.agent_id;
  const testCall = useTestCall();

  const close = ({ refocus = false } = {}) => {
    setOpen(false);
    testCall.reset();
    if (refocus) buttonRef.current?.focus();
  };

  // Opening moves focus into the menu; a click anywhere outside closes it.
  useEffect(() => {
    if (!open) return;
    menuItems(menuRef.current)[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const items = menuItems(menuRef.current);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(-1);
        break;
      case "Escape":
        close({ refocus: true });
        break;
      case "Tab":
        close();
        return; // let focus move on
      default:
        return;
    }
    // Handled: keep the editor's own shortcuts (Escape deselects) out of it.
    e.preventDefault();
    e.stopPropagation();
  };

  const startTestCall = async () => {
    if (!agentId) return;
    try {
      await testCall.start(agentId);
      close();
    } catch {
      // Shown in the menu from testCall.error.
    }
  };

  const recent = recentAgents(agents.data);

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={buttonRef}
        type="button"
        className={clsx(styles.trigger, open && styles.triggerOpen)}
        aria-label="Menu"
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
      >
        <MenuIcon />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Menu"
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
        >
          <Link
            to="/"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              close();
            }}
          >
            <ArrowLeftIcon className={styles.icon} />
            Back to agents
          </Link>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            disabled={!agentId || testCall.pending}
            onClick={() => void startTestCall()}
          >
            <PhoneIcon className={styles.icon} />
            {testCall.pending ? "Starting call…" : "Test call"}
            <span className={styles.hint}>{agentId ? "last saved" : "save first"}</span>
          </button>
          {testCall.error && (
            <p className={styles.error} role="alert">
              Couldn't start the call: {errorMessage(testCall.error)}
            </p>
          )}

          {recent.length > 0 && (
            <>
              <div role="separator" className={styles.separator} />
              <div role="group" aria-labelledby={recentLabelId}>
                <span id={recentLabelId} className={styles.groupLabel}>
                  Recent agents
                </span>
                {recent.map((agent) => (
                  <Link
                    key={agent.id}
                    to={`/agents/${agent.id}`}
                    role="menuitem"
                    aria-current={agent.id === agentId ? "page" : undefined}
                    className={clsx(styles.item, agent.id === agentId && styles.current)}
                    onClick={() => {
                      close();
                    }}
                  >
                    <RobotIcon className={styles.icon} />
                    <span className={styles.label}>{agent.name}</span>
                    {agent.id === runningAgentId && <Badge tone="success">Running</Badge>}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
