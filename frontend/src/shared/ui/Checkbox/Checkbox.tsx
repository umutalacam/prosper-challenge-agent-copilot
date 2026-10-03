import { clsx } from "clsx";
import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Checkbox.module.scss";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> {
  label: ReactNode;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ label, onChange, className, ...rest }: CheckboxProps) {
  return (
    <label className={clsx(styles.checkbox, className)}>
      <input
        type="checkbox"
        className={styles.input}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        {...rest}
      />
      {label}
    </label>
  );
}
