import { clsx } from "clsx";
import type { SelectHTMLAttributes } from "react";
import styles from "./Select.module.scss";

export interface SelectOption<T extends string = string> {
  value: T;
  label?: string;
}

export interface SelectProps<T extends string = string> extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange"
> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  className,
  ...rest
}: SelectProps<T>) {
  return (
    <select
      value={value}
      // Options come from `options`, so the selected value is always a T.
      onChange={(e) => {
        onChange(e.target.value as T);
      }}
      className={clsx(styles.select, className)}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label ?? o.value}
        </option>
      ))}
    </select>
  );
}
