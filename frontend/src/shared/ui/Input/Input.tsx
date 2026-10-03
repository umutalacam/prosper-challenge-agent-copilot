import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";
import styles from "./Input.module.scss";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = "text", ...rest }: InputProps) {
  return <input type={type} className={clsx(styles.input, className)} {...rest} />;
}
