import type { ReactNode } from "react";
import { IconButton } from "../IconButton/IconButton";
import styles from "./Banner.module.scss";

export interface BannerProps {
  children: ReactNode;
  onDismiss?: () => void;
}

/** A full-width error message, announced to screen readers. */
export function Banner({ children, onDismiss }: BannerProps) {
  return (
    <div className={styles.banner} role="alert">
      <span>{children}</span>
      {onDismiss && (
        <IconButton label="Dismiss" onClick={onDismiss}>
          ×
        </IconButton>
      )}
    </div>
  );
}
