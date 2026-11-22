type Props = { label: string; checked: boolean; onChange: () => void };

/** A row's or the whole table's checkbox. */
export function SelectionCheckbox({ label, checked, onChange }: Props) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      className="size-4 cursor-pointer accent-foreground"
    />
  );
}
