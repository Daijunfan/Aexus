export type ResearchNode = {
  id: string;
  label: string;
  kind: string;
  status: string;
  role?: string;
  dependencies?: string[];
  dependsOn?: string[];
  employeeId?: string;
  ownerId?: string;
  managerIds?: string[];
  sourceIds?: string[];
  error?: string;
  description?: string;
  active?: boolean;
  objective?: string;
  startedAt?: number;
  finishedAt?: number;
  resultSummary?: string;
  planVersion?: number;
  inputSourceIds?: string[];
  payload?: { query?: string };
  result?: Record<string, any>;
  messageId?: string;
};
export const NODE_WIDTH = 156;
export const NODE_HEIGHT = 156;
export type GraphEdge = { from: string; to: string };
export type EvidenceExcerpt = {
  excerpt: string;
  locator?: string;
  sourceId?: string;
};
export type SourceSelection = { id: string; locator?: string };
export type ResearchSource = {
  id: string;
  title: string;
  url: string;
  type?: string;
  snippet?: string;
  summary?: string;
  verified: boolean;
  verificationNotes?: string;
  acquisition?: {
    status: string;
    method?: string;
    excerpt?: string;
    locator?: string;
    reason?: string;
    excerpts?: (EvidenceExcerpt & {
      sha256: string;
      accessedAt: number;
      finalUrl: string;
      mediaType?: string;
    })[];
    rejections?: (EvidenceExcerpt & { reason: string; nodeId?: string })[];
  };
};
export type ResearchReport = {
  title: string;
  abstract?: string;
  sections: {
    id: string;
    heading: string;
    content: string;
    citations: string[];
    evidence?: EvidenceExcerpt[];
  }[];
  conclusion?: string;
  limitations?: string[];
};
export type ResearchFinding = {
  id: string;
  claim: string;
  sourceIds: string[];
  evidence?: EvidenceExcerpt[];
};
export const independentlyRead = (source: ResearchSource) =>
  source.acquisition?.status === "read" &&
  source.acquisition.method === "independent-http" &&
  !!source.acquisition.excerpts?.length;
export function acquisitionLabel(source: ResearchSource) {
  if (independentlyRead(source))
    return source.acquisition?.rejections?.length
      ? `已独立读取 · ${source.acquisition.rejections.length} 片段未通过`
      : source.verified
        ? "已核验"
        : "已读取 · 待核验";
  if (source.acquisition?.status === "unavailable") return "无法读取";
  if (source.acquisition?.status === "read" || source.verified)
    return "历史来源 · 未独立验证";
  return "已发现 · 待读取";
}
const LABELS: Record<string, string> = {
  pending: "待执行",
  prepared: "待执行",
  running: "进行中",
  working: "工作中",
  completed: "已完成",
  failed: "需处理",
  superseded: "已调整",
  idle: "待命",
  approval: "待授权",
  scouting: "初步调研",
  scout: "检索原始资料与研究缺口",
  "plan-review": "审阅调查计划",
  plan: "规划",
  research: "研究",
  search: "检索",
  extract: "提取证据",
  verify: "核验",
  verification: "核验",
  synthesize: "综合",
  synthesis: "综合",
  write: "撰写",
  writing: "撰写",
  review: "审阅",
  manager: "Manager",
  coordinator: "研究协调员",
  researcher: "研究员",
  verifier: "证据核验员",
  synthesizer: "综合分析员",
  writer: "报告撰写员",
  cancelled: "已停止",
  paused: "已暂停",
  stopping: "停止确认中",
};
export const labelFor = (value: string) => LABELS[value] ?? value;
export function displayStatus(
  value: string,
  workflow?: { status: string; controlPending?: boolean },
) {
  return ["running", "working"].includes(value) &&
    workflow &&
    ["paused", "cancelled"].includes(workflow.status)
    ? workflow.controlPending
      ? "stopping"
      : workflow.status
    : value;
}
export function activityLabel(preview: { kind: string; tool?: string }) {
  if (preview.kind === "thinking") return "分析证据";
  if (preview.kind !== "tool") return "整理研究进展";
  const tool = preview.tool?.toLowerCase() ?? "";
  if (/search|browse/.test(tool)) return "检索资料";
  if (/read|fetch|open/.test(tool)) return "读取资料";
  if (/write|edit/.test(tool)) return "整理研究结果";
  return "正在处理";
}
export function safeUrl(value?: string) {
  try {
    const url = new URL(value!);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function sourceHost(value?: string) {
  try {
    return new URL(value!).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Place each task after its dependencies without adding a graph dependency. */
export function layoutGraph(
  nodes: ResearchNode[],
  suppliedEdges?: GraphEdge[],
  direction?: "horizontal" | "vertical",
) {
  const active = nodes.filter(
    (node) => node.active !== false && node.status !== "superseded",
  );
  const ids = new Set(active.map((node) => node.id));
  const edges = (
    suppliedEdges ??
    active.flatMap((node) =>
      (node.dependencies ?? node.dependsOn ?? []).map((from) => ({
        from,
        to: node.id,
      })),
    )
  ).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const incoming = new Map(
    active.map((node) => [
      node.id,
      edges.filter((edge) => edge.to === node.id).length,
    ]),
  );
  const columns = new Map<string, number>();
  const queue = active
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const edge of edges.filter((edge) => edge.from === id)) {
      columns.set(
        edge.to,
        Math.max(columns.get(edge.to) ?? 0, (columns.get(id) ?? 0) + 1),
      );
      incoming.set(edge.to, incoming.get(edge.to)! - 1);
      if (incoming.get(edge.to) === 0) queue.push(edge.to);
    }
  }
  const levels = new Map<number, ResearchNode[]>();
  for (const node of active) {
    const level = columns.get(node.id) ?? 0;
    levels.set(level, [...(levels.get(level) ?? []), node]);
  }
  const order = new Map<string, number>();
  for (const [level, group] of [...levels].sort(([a], [b]) => a - b)) {
    const parentPosition = (node: ResearchNode) => {
      const parents = edges
        .filter((edge) => edge.to === node.id)
        .map((edge) => order.get(edge.from) ?? 0);
      return parents.length
        ? parents.reduce((sum, row) => sum + row, 0) / parents.length
        : 0;
    };
    group.sort((a, b) => parentPosition(a) - parentPosition(b));
    group.forEach((node, row) => order.set(node.id, row));
  }
  const breadth = Math.max(
    ...[...levels.values()].map((group) => group.length),
  );
  const vertical = direction ? direction === "vertical" : levels.size > breadth;
  const width = vertical ? breadth * 224 + 30 : (levels.size - 1) * 246 + 212;
  const height = vertical ? (levels.size - 1) * 188 + 212 : breadth * 188 + 30;
  const positioned = active.map((node) => {
    const column = columns.get(node.id) ?? 0,
      group = levels.get(column)!;
    return {
      ...node,
      x: vertical
        ? 28 + order.get(node.id)! * 224 + (breadth - group.length) * 112
        : 28 + column * 246,
      y: vertical
        ? 30 + column * 188
        : 30 + order.get(node.id)! * 188 + (breadth - group.length) * 94,
    };
  });
  return {
    nodes: positioned,
    edges,
    width: Math.max(212, width),
    height: Math.max(212, height),
    vertical,
  };
}
