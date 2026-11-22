/** One field of a record type, as its panel and its history show it. */
export interface RecordField {
  /** The history field key, such as `firstName`. */
  key: string;
  label: string;
  /** The panel section the field sits in, such as "Personal"; none for a field shown elsewhere. */
  section?: string;
  /** How a stored value shows, such as a code as its name. */
  format: (value: string) => string;
  /** Never among the panel's sections: only in history, or elsewhere, such as a person's work email. */
  historyOnly?: boolean;
}

/**
 * What the web app knows about a record type: its fields and which one names a record. Kept in
 * the frontend until the server describes record types.
 */
export interface RecordDescription {
  fields: RecordField[];
  /** The field whose value names the record in "added …" and "removed …". */
  titleField: string;
}
