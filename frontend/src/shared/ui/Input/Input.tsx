import { clsx } from "clsx";
import type { ComponentProps } from "react";
import styles from "./Input.module.scss";

/** Every <input> prop, `ref` included (a plain prop in React 19). */
export type InputProps = ComponentProps<"input">;

export function Input({ className, type = "text", ...rest }: InputProps) {
  return <input type={type} className={clsx(styles.input, className)} {...rest} />;
}
