import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";
import styles from "./IconButton.module.scss";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> {
  /** Accessible name; also shown as the tooltip. Required since there's no visible text. */
  label: string;
}

export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(styles.iconButton, className)}
      {...rest}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
