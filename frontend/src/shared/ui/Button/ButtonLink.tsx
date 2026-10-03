import { Link, type LinkProps } from "react-router";
import { buttonClassName, type ButtonStyleProps } from "./buttonClassName";

export interface ButtonLinkProps extends LinkProps, ButtonStyleProps {}

/** A router link styled as a button — for navigation, use this rather than onClick. */
export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClassName({ variant, size, block }, className)} {...rest} />;
}
