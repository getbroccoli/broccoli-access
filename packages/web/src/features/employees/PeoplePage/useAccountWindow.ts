import { useRef, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";

interface Page<Node> {
  edges: { node: Node }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

interface WindowOptions<Node> {
  current: () => Page<Node> | undefined;
  fetchPage: (first: number, after?: string | null) => Promise<Page<Node> | undefined>;
  store: (page: Page<Node>, previous?: Page<Node>) => void;
  loading: boolean;
}

/** Serialises paging with refreshes so a scan preserves the whole window the owner opened. */
export function useAccountWindow<Node>({
  current,
  fetchPage,
  store,
  loading,
}: WindowOptions<Node>) {
  const pending = useRef(Promise.resolve());
  const [busy, setBusy] = useState(false);

  const queuedRefresh = useRef<Promise<void> | null>(null);
  function read(append: number | null) {
    const more = append !== null;
    if (!more && queuedRefresh.current) return queuedRefresh.current;
    setBusy(true);
    const next = pending.current
      .then(async () => {
        if (!more) queuedRefresh.current = null;
        const previous = current();
        if (more && !previous?.pageInfo.hasNextPage) return;
        const size = append ?? Math.max(PAGE_SIZE, previous?.edges.length ?? 0);
        const page = await fetchWindow(fetchPage, size, more ? previous?.pageInfo.endCursor : null);
        const edges = more ? [...(current()?.edges ?? []), ...page.edges] : page.edges;
        store({ ...page, edges }, previous);
      })
      .catch(() =>
        toast.error(t(more ? "people.accounts.moreFailed" : "people.accounts.loadFailed")),
      );
    const done = next.then(() => {
      if (pending.current === done) setBusy(false);
    });
    pending.current = done;
    if (!more) queuedRefresh.current = done;
    return done;
  }
  return {
    loading: busy || loading,
    refresh: () => read(null),
    loadMore: () => read(PAGE_SIZE),
    refill: () => read(1),
  };
}
const PAGE_SIZE = 100;

/** Reads the loaded window in chunks when it exceeds the server's page limit. */
async function fetchWindow<Node>(
  fetchPage: WindowOptions<Node>["fetchPage"],
  remaining: number,
  after?: string | null,
): Promise<Page<Node>> {
  const edges: Page<Node>["edges"] = [];
  for (;;) {
    const page = await fetchPage(Math.min(remaining, 10_000), after);
    if (!page) throw new Error("No account page was returned.");
    edges.push(...page.edges);
    remaining -= page.edges.length;
    if (!page.pageInfo.hasNextPage || remaining <= 0) return { ...page, edges };
    after = page.pageInfo.endCursor;
  }
}
