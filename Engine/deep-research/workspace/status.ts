/** Status labels shared by the workbench header and research history. */
export const STATUS: Record<string, string> = {
  running: "进行中",
  waiting: "待确认",
  paused: "已暂停",
  completed: "已完成",
  failed: "需处理",
  cancelled: "已停止",
};

export const PHASES: Record<string, string> = {
  init: "准备研究",
  scouting: "初步调研",
  planning: "制定计划",
  research: "研究执行",
  verification: "核验证据",
  synthesis: "综合发现",
  writing: "撰写报告",
  review: "审阅报告",
  complete: "研究完成",
};
