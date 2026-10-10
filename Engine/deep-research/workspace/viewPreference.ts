const prefix = "aexus:research:view:";
const views = new Set([
  "overview", "graph", "comparison", "findings", "sources",
  "report", "timeline", "updates", "board",
]);

/** Browser-local presentation preference; no workflow or domain data is mutated. */
export function readResearchView(jobId: string): string | null {
  try {
    const value = localStorage.getItem(prefix + jobId);
    return value && views.has(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberResearchView(jobId: string, view: string) {
  if (!jobId || !views.has(view)) return;
  try {
    localStorage.setItem(prefix + jobId, view);
  } catch {
    // The workbench remains usable in embedded or private browsing contexts.
  }
}
