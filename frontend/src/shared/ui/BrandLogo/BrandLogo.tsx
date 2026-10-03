import logo from "@/assets/prosper_logo.png";
import styles from "./BrandLogo.module.scss";

export interface BrandLogoProps {
  /** Product name shown under the wordmark. */
  product?: string;
}

export function BrandLogo({ product }: BrandLogoProps) {
  return (
    <div className={styles.brand}>
      <img src={logo} alt="Prosper" width={120} height={38} className={styles.logo} />
      {product && <span className={styles.product}>{product}</span>}
    </div>
  );
}
