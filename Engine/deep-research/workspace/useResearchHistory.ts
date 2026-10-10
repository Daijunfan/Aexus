import { useEffect, useRef, useState } from "react";
import type { ContractClient } from "../../../Contract/protocol";
import type { WorkflowView } from "../../../Contract/workflow";

const ENGINE = "deep-research";
const PAGE_SIZE = 30;

/** Merge optimistic/live revisions with paginated server results without losing newer views. */
export function mergeResearchHistory(
  current: readonly WorkflowView[],
  incoming: readonly WorkflowView[],
): WorkflowView[] {
  const jobs = new Map(current.map(job => [job.id, job]));
  for (const job of incoming) {
    const previous = jobs.get(job.id);
    if (!previous || previous.revision < job.revision) jobs.set(job.id, job);
  }
  return [...jobs.values()].sort(
    (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  );
}

/** Pagination uses server row counts, never locally merged/updated history length. */
export function useResearchHistory(client: ContractClient, onError: (message: string) => void) {
  const [history, setHistory] = useState<WorkflowView[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const offset = useRef(0);
  const fetching = useRef(false);
  const alive = useRef(true);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const updateHistory = (view: WorkflowView) =>
    setHistory(old => mergeResearchHistory(old, [view]));

  useEffect(() => {
    let active = true;
    alive.current = true;
    offset.current = 0;
    fetching.current = true;
    setLoading(true);
    void client.invoke<{ jobs: WorkflowView[]; hasMore?: boolean }>(
      "workflow.list", { engineId: ENGINE, offset: 0, limit: PAGE_SIZE },
    ).then(({ jobs, hasMore }) => {
      if (!active) return;
      offset.current = jobs.length;
      setHistory(old => mergeResearchHistory(old, jobs));
      setHasMore(!!hasMore);
    }).catch(error => {
      if (active) errorRef.current((error as Error).message);
    }).finally(() => {
      if (!active) return;
      fetching.current = false;
      setLoading(false);
    });
    return () => { active = false; alive.current = false; };
  }, [client]);

  const loadMoreHistory = async () => {
    if (!alive.current || fetching.current || !hasMore) return;
    fetching.current = true;
    try {
      const response = await client.invoke<{ jobs: WorkflowView[]; hasMore: boolean }>(
        "workflow.list",
        { engineId: ENGINE, offset: offset.current, limit: PAGE_SIZE },
      );
      if (!alive.current) return;
      offset.current += response.jobs.length;
      setHasMore(response.hasMore);
      setHistory(old => mergeResearchHistory(old, response.jobs));
    } finally {
      fetching.current = false;
    }
  };

  return { history, hasMore, loading, updateHistory, loadMoreHistory };
}
