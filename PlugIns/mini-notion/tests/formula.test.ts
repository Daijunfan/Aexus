import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFormula,
  formulaText,
  type FormulaContext,
  type FormulaValue,
} from '../src/database/formula.ts';

const context: FormulaContext = {
  pageId: 'root',
  now: new Date('2026-09-10T12:00:00+08:00'),
  property: (name, id) => {
    const values: Record<string, FormulaValue> = {
      工时: 5,
      单价: 120,
      状态: '进行中',
      标签: ['工作', '灵感'],
      任务: [
        { kind: 'page', id: 'a' },
        { kind: 'page', id: 'b' },
      ],
    };
    if (id) return name === '完成' ? id === 'a' : name === '时长' ? (id === 'a' ? 2 : 3) : '';
    if (!Object.hasOwn(values, name)) throw new Error(`未找到属性 ${name}`);
    return values[name];
  },
  pageName: (id) => `任务 ${id}`,
};
const run = (expression: string) => evaluateFormula(expression, context);

test('Notion arithmetic, comparison, boolean and conditional expressions', () => {
  assert.equal(run('prop("工时") * prop("单价")'), 600);
  assert.equal(run('round(pi() * 4 ^ 2)'), 50);
  assert.equal(run('2 ^ 3 ^ 2'), 512);
  assert.equal(run('true and not false'), true);
  assert.equal(run('and(true, false)'), false);
  assert.equal(run('or(false, true)'), true);
  assert.equal(run('if(prop("状态") == "进行中", "正在进行", "其他")'), '正在进行');
  assert.equal(run('false ? 1 / 0 : 5'), 5);
  assert.equal(run('ifs(false, 1, true, 2, 3)'), 2);
  assert.equal(run('empty(0) and empty([]) and empty("")'), true);
});
test('text and regex functions use Notion function and method syntax', () => {
  assert.equal(run('"  Hello Notion  ".trim().upper()'), 'HELLO NOTION');
  assert.equal(run('substring("Notion", 0, 3)'), 'Not');
  assert.equal(run('replaceAll("Notion 123", "[0-9]", "")'), 'Notion ');
  assert.deepEqual(run('match("Notion 123 Notion 456", "[0-9]+")'), ['123', '456']);
  assert.equal(run('"备注：" + format(prop("工时"))'), '备注：5');
  assert.equal(run('repeat("-", 4)'), '----');
  assert.equal(formulaText(run('style("重点", "b", "blue")')), '重点');
  assert.equal(formulaText(run('link("项目", "https://example.com")')), '项目');
});
test('list lambdas, relation page properties and variable scopes', () => {
  assert.deepEqual(run('[1,2,3].map(current + index)'), [1, 3, 5]);
  assert.deepEqual(run('filter([1,2,3], current > 1)'), [2, 3]);
  assert.equal(run('prop("任务").filter(current.prop("完成")).length()'), 1);
  assert.equal(run('prop("任务").map(current.prop("时长")).sum()'), 5);
  assert.equal(run('prop("任务").first().id()'), 'a');
  assert.equal(run('lets(a, 3, b, 8, a * b / 2)'), 12);
  assert.equal(run('let(radius, 4, round(pi() * radius ^ 2))'), 50);
  assert.deepEqual(run('concat([1, 2], [2, 3]).unique().reverse()'), [3, 2, 1]);
  assert.equal(run('findIndex([1, 2, 3], current > 1)'), 1);
  assert.equal(run('every([1, 2, 3], current > 0)'), true);
  assert.equal(run('["alpha", "b"].some(current.length > 2)'), true);
});
test('numeric and date functions preserve units and date ranges', () => {
  assert.equal(run('round(1.234, 2)'), 1.23);
  assert.equal(run('round(1234, -2)'), 1200);
  assert.equal(run('median([1, 2, 3], 4)'), 2.5);
  assert.equal(run('mean([1,2,3],4,5)'), 3);
  assert.equal(run('formatDate(dateAdd(parseDate("2026-01-31"), 1, "months"), "YYYY-MM-DD")'), '2026-02-28');
  assert.equal(run('dateBetween(parseDate("2026-09-10"), parseDate("2026-09-01"), "days")'), 9);
  assert.equal(run('week(parseDate("2023-01-02"))'), 1);
  assert.equal(run('day(parseDate("2023-01-02"))'), 1);
  assert.equal(
    run('formatDate(dateEnd(dateRange(parseDate("2026-01-01"), parseDate("2026-01-10"))), "YYYY/MM/DD")'),
    '2026/01/10',
  );
  assert.equal(run('year(now())'), 2026);
  assert.equal(run('formatNumber(1234.5, "usd", 2)'), '$1,234.50');
});
test('invalid types, syntax, missing properties and arbitrary code are rejected', () => {
  assert.throws(() => run('1 / 0'), /除以零/);
  assert.throws(() => run('if(1, 2, 3)'), /布尔值/);
  assert.throws(() => run('prop("不存在")'), /未找到属性/);
  assert.throws(() => run('globalThis.process.exit()'));
  assert.throws(() => run('"a".constructor("return process")()'));
  assert.throws(() => run('unknown(1)'), /未知函数/);
  assert.throws(() => run('1;2'));
});
