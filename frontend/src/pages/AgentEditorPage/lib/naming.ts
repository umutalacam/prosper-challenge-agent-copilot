/** `base`, or `base_2`, `base_3`, … — the first one not in `taken`. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Function and field names are exposed to the LLM as tool/JSON-schema identifiers. */
export function isIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

/** Coerce free text into an identifier-safe string while the user types. */
export function toIdentifierChars(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}
