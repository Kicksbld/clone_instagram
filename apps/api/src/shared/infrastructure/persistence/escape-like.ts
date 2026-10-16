/** Échappe `%`, `_` et `\` pour un motif `LIKE` (le `_` est autorisé dans un username). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
