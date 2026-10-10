import { memo } from "react";
import { clean, nodeInsight } from "../ResearchInsights";
import {
  labelFor, NODE_HEIGHT, NODE_WIDTH, type ResearchNode,
} from "../ui";

/** Single visual projection of a task. Selection and execution remain in the parent. */
export type PositionedResearchNode = ResearchNode & { x: number; y: number };

const ICONS: Record<string, string> = {
  search: "search",
  verify: "verified",
  synthesize: "symbol-misc",
  write: "file-text",
  review: "checklist",
};

export const GraphNodeCard = memo(function GraphNodeCard({
  node, status, index, compact, selected, related, worker,
}: {
  node: PositionedResearchNode;
  status: string;
  index: number;
  compact: boolean;
  selected: boolean;
  related: boolean;
  worker: string;
}) {
  const insight = clean(nodeInsight(node)).slice(0, 64);
  return (
    <button
      type="button"
      data-node-id={node.id}
      className={
        "dr-graph-node " + status +
        (insight ? " has-insight" : "") +
        (selected ? " selected" : related ? " related" : "")
      }
      style={{
        left: node.x, top: node.y,
        width: NODE_WIDTH, height: NODE_HEIGHT,
      }}
      aria-pressed={selected}
      aria-label={node.label + " · " + labelFor(status)}
      title={node.label}
    >
      <svg className="dr-cloud-shape" viewBox="0 0 184 160" aria-hidden="true">
        <path d="M 36 135 C 18 135 7 122 7 105 C 7 89 18 77 34 76 C 36 59 48 48 64 48 C 77 21 111 19 128 40 C 135 48 139 57 139 66 C 161 69 177 84 177 104 C 177 123 163 135 145 135 Z" />
      </svg>
      {!compact && <span className="dr-graph-node-meta">
        <span>
          <span className={"codicon codicon-" + (ICONS[node.kind] ?? "circle-small")} />
          {labelFor(node.kind)}
        </span>
      </span>}
      {compact
        ? <strong className="dr-node-index">{String(index + 1).padStart(2, "0")}</strong>
        : <strong>{node.label}</strong>}
      {!compact && insight && <span className="dr-node-preview">{insight}</span>}
      {!compact && <span className={"dr-node-state " + status}>
        {status === "completed" && <span aria-hidden="true" className="codicon codicon-check" />}
        {labelFor(status)}
      </span>}
      {!compact && <span className="dr-graph-node-footer">
        <span><span className="codicon codicon-person" />{worker}</span>
        {!!node.sourceIds?.length && <span title="已产出证据来源">
          <span className="codicon codicon-link" />{node.sourceIds.length}
        </span>}
      </span>}
    </button>
  );
});
