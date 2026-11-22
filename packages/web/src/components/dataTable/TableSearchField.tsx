import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

interface TableSearchFieldProps {
  query: string | undefined;
  onQueryChange: (query: string | undefined) => void;
  label: string;
  placeholder: string;
  /** The longest search the list's API accepts. */
  maxLength: number;
}

/** Search text that reaches the URL once typing pauses, and follows the URL when it changes. */
export function TableSearchField({
  query = "",
  onQueryChange,
  label,
  placeholder,
  maxLength,
}: TableSearchFieldProps) {
  const [text, setText] = useState(query);
  const [shownQuery, setShownQuery] = useState(query);
  if (query !== shownQuery) {
    setShownQuery(query);
    setText(query);
  }

  useEffect(() => {
    const typed = text.trim();
    if (typed === query) return;
    const timer = setTimeout(() => onQueryChange(typed || undefined), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, query, onQueryChange]);

  return (
    <div className="relative w-full sm:w-80">
      <MagnifyingGlass
        size={16}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        maxLength={maxLength}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 pl-9 text-sm md:text-sm"
      />
    </div>
  );
}
