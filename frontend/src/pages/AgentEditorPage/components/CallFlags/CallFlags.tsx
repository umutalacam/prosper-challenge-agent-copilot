import { useId, useState } from "react";
import { errorMessage, useFlagCall } from "@/shared/api";
import { formatRelative } from "@/shared/lib/time";
import type { CallDetail } from "@/shared/types/call";
import { Button, FlagIcon, TextArea } from "@/shared/ui";
import styles from "./CallFlags.module.scss";

export interface CallFlagsProps {
  call: CallDetail;
  /** The clock relative times are told against. */
  now: Date;
}

/**
 * Customers' flags on a call (something went wrong), and a way to add one by hand
 * for testing. A new flag sends the call's AI analysis back to work.
 */
export function CallFlags({ call, now }: CallFlagsProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const flag = useFlagCall(call.agent_id, call.id);
  const id = useId();

  const close = () => {
    setOpen(false);
    setReason("");
    flag.reset();
  };

  return (
    <div className={styles.flags}>
      {call.flags.length > 0 && (
        <ul className={styles.list} aria-label="Flags">
          {call.flags.map((f) => (
            <li key={f.id} className={styles.flag}>
              <FlagIcon className={styles.mark} width={12} height={12} />
              <span className={styles.reason}>{f.reason}</span>
              <time className={styles.when} dateTime={f.created_at}>
                {formatRelative(new Date(f.created_at), now)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            flag.mutate(reason.trim(), { onSuccess: close });
          }}
        >
          <label htmlFor={`${id}-reason`} className={styles.label}>
            What went wrong?
          </label>
          <TextArea
            id={`${id}-reason`}
            rows={2}
            value={reason}
            autoFocus
            placeholder="e.g. It booked the wrong day"
            onChange={(e) => {
              setReason(e.target.value);
            }}
          />
          {flag.isError && (
            <p className={styles.error} role="alert">
              Couldn&apos;t flag the call: {errorMessage(flag.error)}
            </p>
          )}
          <div className={styles.actions}>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={!reason.trim() || flag.isPending}
            >
              {flag.isPending ? "Flagging…" : "Flag"}
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.add}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(true);
            }}
          >
            <FlagIcon width={12} height={12} />
            Flag this call
          </Button>
          <span className={styles.note}>for testing: customers flag calls themselves</span>
        </div>
      )}
    </div>
  );
}
