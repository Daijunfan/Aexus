import type { ResearchNode, ResearchReport, ResearchFinding } from "./ui";

export type FocusArea = {
  id: string;
  title: string;
  completed: number;
  total: number;
  running: number;
  pending: number;
  nodeIds: string[];
  insight: string;
};
export type MatrixRow = { label: string; values: string[] };
export type ResearchMatrix = { id: string; title: string; columns: string[]; rows: MatrixRow[] };
export type DatedFinding = { id: string; date: string; text: string; source: string };
export type ResearchChange = { id: string; text: string; previous?: string; kind: "added" | "changed" | "removed" };

export const readable = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export function nodeInsight(node: ResearchNode): string {
  const result = node.result as Record<string, unknown> | undefined;
  const insights = Array.isArray(result?.insights) ? result.insights.find(v => typeof v === "string") : "";
  return readable(node.resultSummary) || readable(result?.summary) ||
    readable(result?.conclusion) || readable(insights);
}

export const clean = (text: string) => text.replace(/<[^>]+>/g, "")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  .replace(/[*_#\u0060]/g, "").replace(/\s+/g, " ").trim();

const active = (node: ResearchNode) => node.active !== false && node.status !== "superseded";

export function focusAreas(nodes: ResearchNode[]): FocusArea[] {
  const current = nodes.filter(active);
  if (!current.length) return [];
  const byId = new Map(current.map(node => [node.id, node]));
  const parents = (node: ResearchNode) =>
    (node.dependencies ?? node.dependsOn ?? []).filter(id => byId.has(id));
  const roots = current.filter(node => parents(node).length === 0);
  const directChildren = current.filter(node => parents(node).some(id => roots.some(root => root.id === id)));
  const candidates = [
    ...current.filter(node => node.kind === "search" && parents(node).length <= 1),
    ...directChildren, ...roots, ...current,
  ].filter((node, index, all) => all.findIndex(other => other.id === node.id) === index);
  const selected = candidates.filter(node => node.kind === "search" || (!roots.includes(node) && directChildren.includes(node)));
  const start = selected.length >= 2 ? selected : candidates;
  return start.slice(0, 12).map(node => {
    const seen = new Set<string>();
    const queue = [node.id];
    for (let i = 0; i < queue.length && i < 400; i++) {
      const id = queue[i];
      if (seen.has(id)) continue;
      seen.add(id);
      for (const child of current) {
        if (parents(child).includes(id) && !seen.has(child.id)) queue.push(child.id);
      }
    }
    const relevant = [...seen].map(id => byId.get(id)).filter((n): n is ResearchNode => !!n);
    return {
      id: node.id, title: node.label,
      completed: relevant.filter(n => n.status === "completed").length,
      running: relevant.filter(n => n.status === "running" || n.status === "working").length,
      pending: relevant.filter(n => n.status === "pending" || n.status === "prepared").length,
      total: relevant.length, nodeIds: [...seen],
      insight: clean(nodeInsight(node)).slice(0, 220),
    };
  });
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map(cell => clean(cell.replace(/\\\|/g, "|")));
}
const divider = (line: string) =>
  /^\s*\|?[\s|:\-]+\|?\s*$/.test(line) && line.includes("-");

export function extractMatrices(report?: ResearchReport | null): ResearchMatrix[] {
  if (!report?.sections) return [];
  const tables: ResearchMatrix[] = [];
  for (const section of report.sections) {
    const lines = readable(section.content).split(/\r?\n/);
    for (let i = 0; i + 2 < lines.length; i++) {
      if (!lines[i].includes("|") || !divider(lines[i + 1])) continue;
      const header = tableCells(lines[i]);
      if (header.length < 2 || tableCells(lines[i + 1]).length !== header.length) continue;
      const rows: MatrixRow[] = [];
      for (let j = i + 2; j < lines.length && lines[j].includes("|"); j++) {
        const values = tableCells(lines[j]);
        if (values.length !== header.length) break;
        rows.push({ label: values[0], values: values.slice(1) });
        i = j;
      }
      if (rows.length) {
        tables.push({
          id: String(section.id) + "-" + tables.length,
          title: section.heading,
          columns: header.slice(1),
          rows,
        });
      }
    }
  }
  return tables;
}

const datePattern = /\b(19\d{2}|20\d{2})(?:[-./年](0?[1-9]|1[0-2])(?:[-./月](0?[1-9]|[12]\d|3[01]))?)?/g;
export function extractTopicTimeline(
  report?: ResearchReport | null, findings: ResearchFinding[] = [],
): DatedFinding[] {
  const content: { source: string; text: string }[] = [
    ...(report?.sections ?? []).map(section => ({ source: section.heading, text: section.content })),
    ...findings.map(finding => ({ source: "研究发现", text: finding.claim })),
  ];
  const collected: DatedFinding[] = [];
  const seen = new Set<string>();
  for (const { source, text } of content) {
    for (const sentence of text.split(/[\n。！？!?]+/)) {
      const full = clean(sentence);
      if (!full || full.startsWith("|") || full.includes("---")) continue;
      for (const match of full.matchAll(datePattern)) {
        const date = match[1] + (match[2] ? "-" + match[2].padStart(2, "0") : "") +
          (match[3] ? "-" + match[3].padStart(2, "0") : "");
        const label = full.slice(0, 200);
        const key = date + "|" + label;
        if (!seen.has(key)) {
          collected.push({ id: "date-" + collected.length, date, text: label, source });
          seen.add(key);
        }
      }
    }
  }
  return collected.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
}

export function compareFindings(
  previous: ResearchFinding[], next: ResearchFinding[],
): { changes: ResearchChange[]; retained: number } {
  const before = previous.map(item => ({ id: item.id, text: readable(item.claim), key: clean(readable(item.claim)) }));
  const after = next.map(item => ({ id: item.id, text: readable(item.claim), key: clean(readable(item.claim)) }));
  const matched = new Set<number>();
  const changes: ResearchChange[] = [];
  let retained = 0;
  for (const item of after) {
    const same = before.findIndex((prior, i) => !matched.has(i) && prior.key === item.key);
    if (same >= 0) { retained++; matched.add(same); continue; }
    const sameId = before.findIndex((prior, i) => !matched.has(i) && !!item.id && prior.id === item.id);
    if (sameId >= 0) {
      changes.push({ id: item.id, text: item.text, previous: before[sameId].text, kind: "changed" });
      matched.add(sameId);
    } else {
      changes.push({ id: item.id, text: item.text, kind: "added" });
    }
  }
  before.forEach((item, i) => {
    if (!matched.has(i)) changes.push({ id: item.id, text: item.text, kind: "removed" });
  });
  return { changes, retained };
}
