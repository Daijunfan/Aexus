import { useEffect, useRef, useState, type RefObject } from "react";
import type { ContractClient } from "../../../Contract/protocol";
import type { WorkflowRead, WorkflowView } from "../../../Contract/workflow";

export type Activity = {
  nodeId: string;
  messageId: string;
  preview: { kind: string; text: string; detail?: string; tool?: string };
};

/** Identical native previews need no Page/graph rerender every polling interval. */
export function sameActivityPreviews(a: readonly Activity[], b: readonly Activity[]) {
  return a.length === b.length && a.every((item, index) => {
    const other = b[index];
    return item.nodeId === other.nodeId && item.messageId === other.messageId &&
      item.preview.kind === other.preview.kind &&
      item.preview.text === other.preview.text &&
      item.preview.detail === other.preview.detail &&
      item.preview.tool === other.preview.tool;
  });
}

const observed = (job: WorkflowView) =>
  ["running", "waiting", "paused"].includes(job.status) ||
  (job.status === "cancelled" && !!job.controlPending);

/**
 * Workflow events are invalidation hints; the authorized workflow.get remains
 * authoritative. A slow poll covers old hosts, missed events and reconnects.
 */
export function useWorkflowUpdates({
  client,
  job,
  selected,
  current,
  onUpdate,
  onError,
}: {
  client: ContractClient;
  job: WorkflowView | null;
  selected: RefObject<string | null>;
  current: RefObject<WorkflowView | null>;
  onUpdate: (value: WorkflowView) => void;
  onError: (message: string) => void;
}) {
  const callbacks = useRef({ onUpdate, onError });
  callbacks.current = { onUpdate, onError };

  useEffect(() => {
    if (!job || !observed(job)) return;
    const id = job.id;
    let active = true;
    let reading = false;
    let queued = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      if (!active || selected.current !== id) return;
      if (reading) {
        queued = true;
        return;
      }
      reading = true;
      try {
        const previous = current.current;
        const result = await client.invoke<WorkflowRead>("workflow.get", {
          id,
          ...(previous?.id === id ? { ifRevision: previous.revision } : {}),
        });
        if (!active || selected.current !== id || result.id !== id || "unchanged" in result) return;
        const latest = current.current;
        if (latest?.id !== id || result.revision < latest.revision) return;
        if (result.revision > latest.revision || result.status !== latest.status ||
            result.controlPending !== latest.controlPending) {
          callbacks.current.onUpdate(result);
        }
      } catch (error) {
        if (active && selected.current === id)
          callbacks.current.onError((error as Error).message);
      } finally {
        reading = false;
        if (queued && active) {
          queued = false;
          void refresh();
        }
      }
    };

    const invalidate = () => {
      if (!document.hidden) void refresh();
    };
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    let unwatch: (() => void) | undefined;
    try {
      unwatch = client.watchWorkflow?.(id, invalidate);
    } catch {
      // Polling remains available if the optional presentation channel fails.
    }
    const interval = unwatch ? 5000 : 1500;
    const poll = async () => {
      if (!document.hidden) await refresh();
      if (active) timer = setTimeout(poll, interval);
    };
    timer = setTimeout(poll, interval);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      queued = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unwatch?.();
    };
  }, [client, job?.id, job?.status, job?.controlPending, selected, current]);
}

/** Native activity is a preview, never proof of task completion. */
export function useAgentActivityPreviews({
  client,
  job,
  tab,
  selectedNodeId,
}: {
  client: ContractClient;
  job: WorkflowView | null;
  tab: string;
  selectedNodeId: string | null;
}): Activity[] {
  const [activities, setActivities] = useState<Activity[]>([]);
  const jobRef = useRef(job);
  const selectedNodeRef = useRef(selectedNodeId);
  jobRef.current = job;
  selectedNodeRef.current = selectedNodeId;

  useEffect(() => {
    setActivities(old => old.length ? [] : old);
    if (!job || job.status !== "running" || tab !== "graph") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (document.hidden) {
        if (active) timer = setTimeout(poll, 3000);
        return;
      }
      const summary = jobRef.current?.summary;
      const runningNodes = (summary?.graph?.nodes ?? [])
        .filter((node: any) =>
          node.status === "running" && node.employeeId && node.messageId)
        .sort((a: any, b: any) =>
          Number(b.id === selectedNodeRef.current) - Number(a.id === selectedNodeRef.current));
      const running = runningNodes.length ? runningNodes :
        (summary?.tasks ?? []).filter((task: any) =>
          ["running", "approval"].includes(task.status) && task.employeeId && task.messageId);
      const results = await Promise.allSettled(
        running.slice(0, 2).map(async (node: any): Promise<Activity | null> => {
          const [status] = await client.invoke<any[]>("session.status", { employee: node.employeeId });
          const preview = status?.activityPreview;
          return status?.currentTask?.messageId === node.messageId &&
            preview && preview.kind !== "thinking"
            ? { nodeId: node.id, messageId: node.messageId, preview }
            : null;
        }),
      );
      if (active) {
        const next = results.flatMap(result =>
          result.status === "fulfilled" && result.value ? [result.value] : []);
        setActivities(old => sameActivityPreviews(old, next) ? old : next);
        timer = setTimeout(poll, 3000);
      }
    };
    timer = setTimeout(poll, 300);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [client, job?.id, job?.status, tab]);
  return job?.status === "running" && tab === "graph" ? activities : [];
}
