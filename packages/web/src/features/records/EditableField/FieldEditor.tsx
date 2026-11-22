import { Input } from "@/components/ui/input";

import type { RecordField } from "../recordDescription";

type Props = {
  field: RecordField;
  value: string;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: string) => void;
  /** The person finished with the field; its value stays in the draft. */
  onDone: () => void;
  /** Escape: the field goes back to its saved value. */
  onRevert: () => void;
};

/** The text input a record field is edited in. */
export function FieldEditor({
  field,
  value,
  invalid,
  describedBy,
  onChange,
  onDone,
  onRevert,
}: Props) {
  return (
    <Input
      value={value}
      autoFocus
      aria-label={field.label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone();
        if (event.key === "Escape") {
          // Escape reverts this field only; it must not also close the panel.
          event.stopPropagation();
          onRevert();
        }
      }}
    />
  );
}
