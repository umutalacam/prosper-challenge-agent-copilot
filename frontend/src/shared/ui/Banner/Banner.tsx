import { clsx } from "clsx";
import type { ReactNode } from "react";
import { IconButton } from "../IconButton/IconButton";
import styles from "./Banner.module.scss";

export interface BannerProps {
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/** A full-width error message, announced to screen readers. */
export function Banner({ children, onDismiss, className }: BannerProps) {
  return (
    <div className={clsx(styles.banner, className)} role="alert">
      <span>{children}</span>
      {onDismiss && (
        <IconButton label="Dismiss" onClick={onDismiss}>
          ×
        </IconButton>
      )}
    </div>
  );
}
