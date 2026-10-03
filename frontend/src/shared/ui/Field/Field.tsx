import { useId, type ReactNode } from "react";
import styles from "./Field.module.scss";

/** Props a Field hands to its control so label, hint and error are wired up for a11y. */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + optional hint + optional error around any form control.
 *
 *   <Field label="Name">{(p) => <Input {...p} value={name} onChange={…} />}</Field>
 */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {children({
        id,
        ...(describedBy && { "aria-describedby": describedBy }),
        ...(error && { "aria-invalid": true }),
      })}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
