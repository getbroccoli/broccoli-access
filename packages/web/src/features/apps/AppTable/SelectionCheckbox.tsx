type Props = {
  label: string;
  checked: boolean;
  /** Some, not all, of the rows it stands for are selected. */
  indeterminate?: boolean;
  onChange: () => void;
};

/** A row's or the whole table's checkbox. */
export function SelectionCheckbox({ label, checked, indeterminate = false, onChange }: Props) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      // `indeterminate` exists only as a DOM property.
      ref={(input) => {
        if (input) {
          input.indeterminate = indeterminate;
        }
      }}
      onChange={onChange}
      className="size-4 cursor-pointer accent-foreground"
    />
  );
}
