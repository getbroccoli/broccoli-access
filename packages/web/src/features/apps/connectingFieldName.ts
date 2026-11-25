/**
 * What connects an app, as copy names it mid-sentence: the label of its secret field (else its
 * first), such as "personal API key".
 */
export function connectingFieldName(fields: readonly { label: string; secret: boolean }[]): string {
  const label = (fields.find(({ secret }) => secret) ?? fields[0])?.label ?? "";
  return inSentence(label);
}

/** Lowercases the initial inside a sentence while preserving an opening acronym. */
export function inSentence(label: string): string {
  return label.replace(/^.(?!\p{Lu})/u, (initial) => initial.toLowerCase());
}
