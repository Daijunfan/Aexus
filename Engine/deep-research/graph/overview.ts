/** Far-out semantic navigation: faithful visual regions, never new execution tasks. */
export type OverviewNode = {
  id: string; label: string; x: number; y: number; status: string; kind: string;
};
export type OverviewEdge = { from: string; to: string };
export type OverviewRegion = {
  id: string; index: number; total: number;
  startIndex: number; endIndex: number;
  firstLabel: string; lastLabel: string; focusId: string;
  completed: number; running: number; failed: number; pending: number; other: number;
  incoming: number; outgoing: number;
};

export function projectGraphOverview(
  nodes: readonly OverviewNode[], edges: readonly OverviewEdge[],
  vertical: boolean, maxRegions = 12,
): OverviewRegion[] {
  if (!nodes.length) return [];
  const sorted = [...nodes].sort((a, b) => {
    const primary = vertical ? a.y - b.y : a.x - b.x;
    return primary || (vertical ? a.x - b.x : a.y - b.y) || a.id.localeCompare(b.id);
  });
  const regions = Math.min(sorted.length, Math.max(1, Math.min(maxRegions, Math.ceil(sorted.length / 10))));
  const chunk = Math.ceil(sorted.length / regions);
  const groups: OverviewRegion[] = [];
  const owner = new Map<string, number>();
  for (let first = 0; first < sorted.length; first += chunk) {
    const part = sorted.slice(first, first + chunk);
    const index = groups.length;
    const focus = part.find(node => ["failed", "running", "working", "paused", "stopping"].includes(node.status)) ??
      part.find(node => ["pending", "prepared"].includes(node.status)) ??
      part[Math.floor(part.length / 2)];
    for (const node of part) owner.set(node.id, index);
    const completed = part.filter(node => node.status === "completed").length;
    const running = part.filter(node => ["running", "working"].includes(node.status)).length;
    const failed = part.filter(node => node.status === "failed").length;
    const pending = part.filter(node => ["pending", "prepared"].includes(node.status)).length;
    groups.push({
      id: "region-" + index, index, total: part.length,
      startIndex: first + 1, endIndex: first + part.length,
      firstLabel: part[0].label, lastLabel: part[part.length - 1].label,
      focusId: focus.id, completed, running, failed, pending,
      other: part.length - completed - running - failed - pending,
      incoming: 0, outgoing: 0,
    });
  }
  for (const edge of edges) {
    const from = owner.get(edge.from), to = owner.get(edge.to);
    if (from === undefined || to === undefined || from === to) continue;
    groups[from].outgoing++;
    groups[to].incoming++;
  }
  return groups;
}

export type TopicGuide = {
  id: string; title: string; focusId: string; tasks: number;
  status: "linked-findings" | "verified-material" | "read-pending-verification" |
    "candidates-only" | "unassessed";
  candidateSources: number; readSources: number; verifiedSources: number; findings: number;
};

/** Use only Knowledge-owned topic provenance and existing task IDs for navigation. */
export function projectTopicGuides(
  topics: readonly {
    id: string; title: string; nodeIds: readonly string[]; status: TopicGuide["status"];
    candidateSourceIds: readonly string[]; readSourceIds: readonly string[];
    verifiedSourceIds: readonly string[]; findingIds: readonly string[];
  }[],
  nodes: readonly OverviewNode[],
): TopicGuide[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const result: TopicGuide[] = [];
  const seen = new Set<string>();
  for (const topic of topics) {
    if (!topic.title.trim() || seen.has(topic.id)) continue;
    const members = topic.nodeIds.map(id => byId.get(id)).filter(
      (node): node is OverviewNode => !!node,
    );
    if (!members.length) continue;
    const focus = members.find(node => ["failed", "running", "working", "paused", "stopping"].includes(node.status)) ??
      members.find(node => ["pending", "prepared"].includes(node.status)) ?? members[0];
    seen.add(topic.id);
    result.push({
      id: topic.id, title: topic.title, focusId: focus.id, tasks: members.length,
      status: topic.status, candidateSources: topic.candidateSourceIds.length,
      readSources: topic.readSourceIds.length,
      verifiedSources: topic.verifiedSourceIds.length, findings: topic.findingIds.length,
    });
  }
  return result;
}
