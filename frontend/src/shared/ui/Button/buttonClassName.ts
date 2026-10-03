import { clsx } from "clsx";
import styles from "./Button.module.scss";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link";
export type ButtonSize = "sm" | "md";

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container's width. */
  block?: boolean;
}

/** Shared by <Button> and <ButtonLink> so links can look like buttons. */
export function buttonClassName(
  { variant = "secondary", size = "md", block = false }: ButtonStyleProps,
  className?: string,
): string {
  return clsx(styles.button, styles[variant], styles[size], block && styles.block, className);
}
