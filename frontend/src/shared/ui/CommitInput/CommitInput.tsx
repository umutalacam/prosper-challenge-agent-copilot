import { useState } from "react";
import { Input, type InputProps } from "../Input/Input";

export interface CommitInputProps extends Omit<InputProps, "value" | "onChange" | "onBlur"> {
  value: string;
  onCommit: (value: string) => void;
  /** Return an error message to block the commit; it's reported via `onErrorChange`. */
  validate?: (value: string) => string | null;
  onErrorChange?: (error: string | null) => void;
}

/**
 * A text input that applies its value only on blur / Enter (Escape reverts).
 * For identifiers — node and field names — where applying every keystroke would
 * cascade renames or briefly collide with an existing name.
 */
export function CommitInput({
  value,
  onCommit,
  validate,
  onErrorChange,
  onKeyDown,
  ...rest
}: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);

  // Adopt external changes (e.g. undo, selecting another item) during render.
  if (value !== committed) {
    setCommitted(value);
    setDraft(value);
  }

  const update = (next: string) => {
    setDraft(next);
    onErrorChange?.(next === value ? null : (validate?.(next) ?? null));
  };

  const commit = () => {
    if (draft === value) return;
    if (validate?.(draft)) update(value);
    else onCommit(draft);
  };

  return (
    <Input
      {...rest}
      value={draft}
      onChange={(e) => {
        update(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") update(value);
        onKeyDown?.(e);
      }}
    />
  );
}
