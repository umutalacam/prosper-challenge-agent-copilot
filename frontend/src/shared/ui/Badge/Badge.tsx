import { clsx } from "clsx";
import type { ReactNode } from "react";
import styles from "./Badge.module.scss";

export type BadgeTone = "success" | "neutral" | "brand";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={clsx(styles.badge, styles[tone])}>{children}</span>;
}
