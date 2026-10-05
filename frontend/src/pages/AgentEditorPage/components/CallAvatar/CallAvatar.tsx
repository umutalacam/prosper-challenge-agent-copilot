import Avatar from "boring-avatars";
import styles from "./CallAvatar.module.scss";

// The faces' colours: shades of the brand orange only, from deep to light
// ($color-brand #ff421c and $color-accent #d9330d from shared/styles/_tokens.scss,
// plus darker and lighter steps of it; boring-avatars takes hex values, not
// SCSS). No grays, and nothing near white, which would vanish on the pane.
const PALETTE = ["#9f2307", "#d9330d", "#ff421c", "#ff7a5c", "#ffad94"];

export interface CallAvatarProps {
  /** What picks the face: the same seed always draws the same one (a call's id). */
  seed: string;
  size?: number;
}

/** A cartoon face for a caller, drawn locally (no image requests). Decorative. */
export function CallAvatar({ seed, size = 32 }: CallAvatarProps) {
  return (
    <span className={styles.avatar}>
      <Avatar name={seed} variant="beam" colors={PALETTE} size={size} aria-hidden="true" />
    </span>
  );
}
