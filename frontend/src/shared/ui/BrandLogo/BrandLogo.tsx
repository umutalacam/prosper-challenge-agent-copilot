import logo from "@/assets/prosper_logo.png";
import styles from "./BrandLogo.module.scss";

export interface BrandLogoProps {
  /** Product name shown under the wordmark. */
  product?: string;
  /** Toolbar size: a smaller wordmark, no product name. */
  compact?: boolean;
}

export function BrandLogo({ product, compact = false }: BrandLogoProps) {
  if (compact) {
    return <img src={logo} alt="Prosper" width={70} height={22} className={styles.logo} />;
  }
  return (
    <div className={styles.brand}>
      <img src={logo} alt="Prosper" width={120} height={38} className={styles.logo} />
      {product && <span className={styles.product}>{product}</span>}
    </div>
  );
}
