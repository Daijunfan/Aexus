import { useEffect, useState } from "react";
import type { BoardItem } from "../ResearchViews";
import type { ResearchMatrix } from "../ResearchInsights";

const EMPTY_BOARD: BoardItem[] = [];

/**
 * Browser-local editorial state, scoped to one immutable workflow identity.
 * Research findings and execution status still come from the authorized Host.
 */
export function useResearchStudio(jobId?: string) {
  const [studio, setStudio] = useState<{ jobId: string; board: BoardItem[]; matrix: ResearchMatrix | null }>({ jobId: "", board: [], matrix: null });
  useEffect(() => {
    if (!jobId) return;
    let board: BoardItem[] = [];
    let matrix: ResearchMatrix | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem("aexus:research:studio:" + jobId) || "{}");
      if (Array.isArray(saved.board)) board = saved.board.filter((item: any) =>
        ["node", "finding"].includes(item?.type) && typeof item.id === "string"
      ).slice(0, 100).map((item: any) => ({ type: item.type, id: item.id, note: String(item.note ?? "").slice(0, 3000) }));
      if (saved.matrix?.id === "custom" && Array.isArray(saved.matrix.columns) && Array.isArray(saved.matrix.rows)) {
        const columns = saved.matrix.columns.filter((v: unknown) => typeof v === "string").slice(0, 12);
        matrix = { id: "custom", title: String(saved.matrix.title ?? "我的比较矩阵"), columns,
          rows: saved.matrix.rows.filter((r: any) => typeof r?.label === "string" && Array.isArray(r.values))
            .slice(0, 35).map((r: any) => ({ label: r.label, values: columns.map((_: string, i: number) => String(r.values[i] ?? "").slice(0, 2000)) })) };
      }
    } catch { /* Local storage may be unavailable in embedded contexts. */ }
    setStudio({ jobId: jobId, board, matrix });
  }, [jobId]);
  useEffect(() => {
    if (!jobId || studio.jobId !== jobId) return;
    try { localStorage.setItem("aexus:research:studio:" + jobId, JSON.stringify({ board: studio.board, matrix: studio.matrix })); }
    catch { /* Research still works when local persistence is disabled. */ }
  }, [jobId, studio]);

  const board = studio.jobId === jobId ? studio.board : EMPTY_BOARD;
  const customMatrix = studio.jobId === jobId ? studio.matrix : null;
  const updateBoard = (items: BoardItem[]) => {
    if (!jobId) return;
    setStudio(old => ({ jobId: jobId, matrix: old.jobId === jobId ? old.matrix : null, board: items }));
  };
  const pinItem = (item: BoardItem) => {
    if (board.some(existing => existing.id === item.id && existing.type === item.type))
      updateBoard(board.filter(existing => existing.id !== item.id || existing.type !== item.type));
    else updateBoard([...board, item]);
  };
  const updateMatrix = (matrix: ResearchMatrix | null) => {
    if (!jobId) return;
    setStudio(old => ({ jobId: jobId, board: old.jobId === jobId ? old.board : [], matrix }));
  };

  return { board, customMatrix, updateBoard, updateMatrix, pinItem };
}
