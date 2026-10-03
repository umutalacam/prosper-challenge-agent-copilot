import type { ReactNode } from "react";
import styles from "./InspectorForm.module.scss";

export interface InspectorFormProps {
  title: string;
  /** Rendered above the title, e.g. a "back to node" link. */
  breadcrumb?: ReactNode;
  children: ReactNode;
  /** Destructive actions, pinned at the bottom. */
  footer?: ReactNode;
}

/** Common frame for every inspector form. */
export function InspectorForm({ title, breadcrumb, children, footer }: InspectorFormProps) {
  return (
    <form
      className={styles.form}
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      {breadcrumb}
      <h2 className={styles.title}>{title}</h2>
      {children}
      {footer && <div className={styles.footer}>{footer}</div>}
    </form>
  );
}
