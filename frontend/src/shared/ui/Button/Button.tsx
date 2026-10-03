import type { ButtonHTMLAttributes } from "react";
import { buttonClassName, type ButtonStyleProps } from "./buttonClassName";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {}

/** Defaults to type="button" so buttons inside forms never submit by accident. */
export function Button({ variant, size, block, type = "button", className, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, block }, className)}
      {...rest}
    />
  );
}
