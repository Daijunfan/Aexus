import { useMemo } from "react";
import { ResearchComparison } from "../ResearchViews";
import { extractMatrices, type ResearchMatrix } from "../ResearchInsights";
import type { ResearchReport } from "../ui";
import { ComparisonCharts } from "../deliverables/ComparisonCharts";

/** The workbench composes read-only visualizations and the existing editable matrix. */
export function ResearchComparisonPanel({
  report,
  draft,
  onDraft,
  onDrill,
}: {
  report?: ResearchReport | null;
  draft: ResearchMatrix | null;
  onDraft: (matrix: ResearchMatrix | null) => void;
  onDrill: (topic: string) => void;
}) {
  const matrices = useMemo(
    () => [...extractMatrices(report), ...(draft ? [draft] : [])],
    [report, draft],
  );
  return (
    <>
      <ComparisonCharts matrices={matrices} />
      <ResearchComparison report={report} draft={draft} onDraft={onDraft} onDrill={onDrill} />
    </>
  );
}
