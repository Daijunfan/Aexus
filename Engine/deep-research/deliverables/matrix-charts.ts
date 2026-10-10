import type { ResearchMatrix } from "../ResearchInsights";

/** Presentation-only numeric values. No factual validation or unit conversion is implied. */
export type ChartValue = { label: string; raw: string; value: number };
export type ComparisonChart = {
  id: string;
  matrixId: string;
  matrixTitle: string;
  metric: string;
  unit: string;
  values: ChartValue[];
  omitted: string[];
  maxValue: number;
  maxLabel: string;
};

const units = new Set([
  "%", "元", "万元", "亿元", "美元", "欧元", "英镑", "日元", "人民币",
  "USD", "EUR", "GBP", "JPY", "RMB",
  "Wh", "kWh", "MWh", "W", "kW", "MW",
  "MB", "GB", "TB", "g", "kg", "吨", "t",
  "km", "m", "cm", "公里", "千米", "米", "厘米",
  "秒", "分钟", "小时", "天", "年", "人", "家", "个", "件", "辆", "台", "次", "份", "万", "亿",
  "元/年", "万元/年", "美元/年", "元/月", "美元/月",
]);
const currencyUnits = new Set(["¥", "$", "€", "£"]);
const absent = new Set(["", "-", "—", "–", "n/a", "na", "未知", "未提供", "暂无", "暂无数据", "无数据", "资料缺失", "未披露", "不适用", "待定", "未统计", "tbd", "null", "n.a."]);
const textNumber = /^([¥￥$€£])?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(.*?)$/u;
const notQuantities = /(?:版本|型号|编号|序号|邮编|年份|年度|日期|成立时间|发布时间|上线时间|股票代码|证券代码|\b(?:id|sku|version|serial|postal|zip|date|year|timestamp)\b)/iu;

export function parseComparableValue(raw: string): { value: number; unit: string } | null {
  if (typeof raw !== "string" || raw.length > 80) return null;
  const result = raw.trim().match(textNumber);
  if (!result) return null;
  const prefix = result[1] === "￥" ? "¥" : (result[1] ?? "");
  const suffix = result[3] === "％" ? "%" : result[3];
  // Currency prefixes are not combined with a second unit. ¥ can mean different currencies;
  // no implicit exchange rate, scale conversion, estimation, or range reduction is allowed.
  if (prefix && suffix) return null;
  if (prefix && !currencyUnits.has(prefix)) return null;
  if (suffix && !units.has(suffix)) return null;
  const digits = result[2].replaceAll(",", "");
  // Leading-zero identifiers and numbers beyond IEEE-754 safe precision must not be graphed.
  if (/^0\d/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return null;
  return { value, unit: prefix || suffix };
}

/** Shared visual scale for on-screen and portable output. Zero stays zero. */
export function comparisonBarPercent(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || value < 0 || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, value / maximum * 100));
}

/** Extract strictly comparable, chart-safe rows from already-visible matrices. */
export function projectComparisonCharts(matrices: readonly ResearchMatrix[]): ComparisonChart[] {
  const charts: ComparisonChart[] = [];
  for (const matrix of matrices) {
    if (!matrix || typeof matrix.id !== "string" || typeof matrix.title !== "string" ||
      !Array.isArray(matrix.columns) || matrix.columns.length < 2 ||
      !matrix.columns.every(name => typeof name === "string") || !Array.isArray(matrix.rows)) continue;
    const names = matrix.columns.map(name => name.trim());
    if (names.some(name => !name) || new Set(names).size !== names.length) continue;
    matrix.rows.forEach((row, rowIndex) => {
      if (!row || typeof row.label !== "string" || !row.label.trim() || notQuantities.test(row.label) || !Array.isArray(row.values) || row.values.length > names.length) return;
      const groups = new Map<string, ChartValue[]>();
      names.forEach((label, index) => {
        const raw = String(row.values[index] ?? "").trim();
        const item = absent.has(raw.toLowerCase()) ? null : parseComparableValue(raw);
        if (!item) return;
        const group = groups.get(item.unit) ?? [];
        group.push({ label, raw, value: item.value });
        groups.set(item.unit, group);
      });
      // Plot the uniquely largest literal-unit group; an unlabelled group cannot
      // override any explicit unit. Keep all excluded raw cells in the source table.
      let unit = "";
      let values: ChartValue[] = [];
      let tied = false;
      for (const [candidateUnit, group] of groups) {
        if (group.length > values.length) {
          unit = candidateUnit; values = group; tied = false;
        } else if (group.length === values.length) tied = true;
      }
      if (values.length < 2 || tied || (unit === "" && groups.size > 1)) return;
      const selected = new Set(values.map(item => item.label));
      const omitted = names.filter(label => !selected.has(label));
      const maxValue = Math.max(...values.map(item => item.value));
      charts.push({
        id: matrix.id + ":" + rowIndex,
        matrixId: matrix.id,
        matrixTitle: matrix.title,
        metric: row.label,
        unit,
        values,
        omitted,
        maxValue,
        maxLabel: values.find(item => item.value === maxValue)!.raw,
      });
    });
  }
  return charts;
}
