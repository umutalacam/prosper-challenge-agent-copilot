import { clsx } from "clsx";
import type { TextareaHTMLAttributes } from "react";
import styles from "./TextArea.module.scss";

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ className, rows = 3, ...rest }: TextAreaProps) {
  return <textarea rows={rows} className={clsx(styles.textArea, className)} {...rest} />;
}
