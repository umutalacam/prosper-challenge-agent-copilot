import type { ReactNode } from "react";
import styles from "./Section.module.scss";

export interface SectionProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/** A titled group of related controls (renders a fieldset). */
export function Section({ title, description, children }: SectionProps) {
  return (
    <fieldset className={styles.section}>
      <legend className={styles.title}>{title}</legend>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </fieldset>
  );
}
