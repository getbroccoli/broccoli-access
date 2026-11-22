/**
 * What connects an app, as copy names it mid-sentence: the label of its secret field (else its
 * first), with a lower-case first letter, such as "personal API key".
 */
export function connectingFieldName(fields: readonly { label: string; secret: boolean }[]): string {
  const label = (fields.find(({ secret }) => secret) ?? fields[0])?.label ?? "";
  return inSentence(label);
}

/** A label as it reads inside a sentence; only the first letter changes, so "API" stays. */
export function inSentence(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}
