import { clsx } from "clsx";
import logo from "@/assets/prosper_logo.png";
import styles from "./BrandLogo.module.scss";

export interface BrandLogoProps {
  /** Product name shown under the wordmark. */
  product?: string;
  /** Toolbar size: a smaller wordmark, no product name. */
  compact?: boolean;
  /** Centers the wordmark and product name (the home page's hero). */
  centered?: boolean;
}

export function BrandLogo({ product, compact = false, centered = false }: BrandLogoProps) {
  if (compact) {
    return <img src={logo} alt="Prosper" width={70} height={22} className={styles.logo} />;
  }
  return (
    <div className={clsx(styles.brand, centered && styles.centered)}>
      <img src={logo} alt="Prosper" width={120} height={38} className={styles.logo} />
      {product && <span className={styles.product}>{product}</span>}
    </div>
  );
}
