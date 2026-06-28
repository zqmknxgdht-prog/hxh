/** Inline: 日本語 / English */
export function bilingualInline(ja: string, en?: string): string {
  if (!en || ja === en) return ja;
  return `${ja} / ${en}`;
}

/** Block: Japanese paragraph, blank line, English paragraph */
export function bilingualBlock(ja: string, en?: string): string {
  if (!en || ja === en) return ja;
  return `${ja}\n\n${en}`;
}
