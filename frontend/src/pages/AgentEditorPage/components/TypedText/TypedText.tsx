import { useMemo } from "react";
import { revealStagger, useTextReveal } from "../../hooks/useTextReveal";
import styles from "./TypedText.module.scss";

export interface TypedTextProps {
  /** The text; when it changes, the new text fades in letter by letter. Empty renders nothing. */
  text: string;
  className?: string;
}

/**
 * Text that appears as it's "generated": every letter fades in, each a few ms
 * after the one before, done by CSS (no per-frame React renders). Every letter
 * holds its place from the start, so nothing reflows; when the last one lands it
 * becomes plain text again. Screen readers get the whole text once.
 */
export function TypedText({ text, className }: TypedTextProps) {
  const { revealing, finish } = useTextReveal(text);
  const chars = useMemo(() => Array.from(text), [text]);
  if (!text) return null;
  if (!revealing) return <p className={className}>{text}</p>;

  const stagger = revealStagger(chars.length);
  return (
    <p className={className}>
      <span className={styles.visuallyHidden}>{text}</span>
      <span aria-hidden="true">
        {chars.map((char, i) => (
          <span
            // The text doesn't reorder while it reveals, so the index is a stable key.
            key={i}
            className={styles.char}
            style={{ animationDelay: `${String(i * stagger)}ms` }}
            onAnimationEnd={i === chars.length - 1 ? finish : undefined}
          >
            {char}
          </span>
        ))}
      </span>
    </p>
  );
}
