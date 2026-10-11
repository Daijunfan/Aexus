import jsep from 'jsep';

jsep.addBinaryOp('and', 2);
jsep.addBinaryOp('or', 1);
jsep.addBinaryOp('^', 11, true);
jsep.addUnaryOp('not');

export type PageReference = { kind: 'page'; id: string };
export type PersonValue = { kind: 'person'; id: string; name: string; email: string };
export type StyledText = {
  kind: 'text';
  text: string;
  styles: string[];
  href?: string;
  parts?: StyledText[];
};
export type DateRange = { kind: 'dateRange'; start: Date; end: Date };
export type FormulaValue =
  | string
  | number
  | boolean
  | null
  | Date
  | PageReference
  | PersonValue
  | StyledText
  | DateRange
  | FormulaValue[];
export type FormulaContext = {
  pageId: string;
  property: (name: string, pageId?: string) => FormulaValue;
  pageName?: (id: string) => string;
  now?: Date;
  variables?: Record<string, FormulaValue>;
};
type Scope = Record<string, FormulaValue>;
type Expression = jsep.Expression;

export function formulaText(value: FormulaValue, context?: FormulaContext): string {
  if (value === null) return '';
  if (value instanceof Date)
    return value.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  if (Array.isArray(value)) return value.map((item) => formulaText(item, context)).join(', ');
  if (typeof value === 'object') {
    if (value.kind === 'text') return value.text;
    if (value.kind === 'page') return context?.pageName?.(value.id) || value.id;
    if (value.kind === 'person') return value.name;
    return `${formulaText(value.start)} → ${formulaText(value.end)}`;
  }
  return String(value);
}

export function parseFormulaDate(value: FormulaValue): Date {
  if (value instanceof Date) return new Date(value);
  if (value && typeof value === 'object' && !Array.isArray(value) && value.kind === 'dateRange')
    return new Date(value.start);
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('需要日期类型');
  const date =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(value + 'T00:00:00')
      : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('日期格式无效');
  return date;
}

const number = (value: FormulaValue) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('需要有效的数字');
  return value;
};
const bool = (value: FormulaValue) => {
  if (typeof value !== 'boolean') throw new Error('条件需要布尔值');
  return value;
};
const list = (value: FormulaValue) => {
  if (!Array.isArray(value)) throw new Error('需要列表类型');
  return value;
};
const equal = (a: FormulaValue, b: FormulaValue) =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : JSON.stringify(a) === JSON.stringify(b);
const compare = (a: FormulaValue, b: FormulaValue): number => {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  throw new Error('不能比较不同类型的值');
};

function addDate(value: FormulaValue, amount: number, unit: string): Date {
  const date = parseFormulaDate(value);
  if (['years', 'quarters', 'months'].includes(unit)) {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + amount * (unit === 'years' ? 12 : unit === 'quarters' ? 3 : 1));
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, last));
  } else if (unit === 'days' || unit === 'weeks')
    date.setDate(date.getDate() + amount * (unit === 'weeks' ? 7 : 1));
  else if (unit === 'hours') date.setHours(date.getHours() + amount);
  else if (unit === 'minutes') date.setMinutes(date.getMinutes() + amount);
  else throw new Error(`不支持的时间单位：${unit}`);
  return date;
}

function dateDifference(a: FormulaValue, b: FormulaValue, unit: string): number {
  const from = parseFormulaDate(a),
    to = parseFormulaDate(b);
  if (['years', 'quarters', 'months'].includes(unit)) {
    let months = (from.getFullYear() - to.getFullYear()) * 12 + from.getMonth() - to.getMonth();
    const candidate = addDate(to, months, 'months');
    if (months > 0 && from < candidate) months--;
    if (months < 0 && from > candidate) months++;
    return Math.trunc(months / (unit === 'years' ? 12 : unit === 'quarters' ? 3 : 1));
  }
  const scale: Record<string, number> = { weeks: 604800000, days: 86400000, hours: 3600000, minutes: 60000 };
  if (!scale[unit]) throw new Error(`不支持的时间单位：${unit}`);
  const offset =
    unit === 'days' || unit === 'weeks' ? (from.getTimezoneOffset() - to.getTimezoneOffset()) * 60000 : 0;
  return Math.trunc((from.getTime() - to.getTime() - offset) / scale[unit]);
}

function formatDate(value: FormulaValue, format: string): string {
  const date = parseFormulaDate(value);
  const pad = (value: number) => String(value).padStart(2, '0');
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    Y: String(date.getFullYear()),
    MMMM: months[date.getMonth()],
    MMM: months[date.getMonth()].slice(0, 3),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
    dddd: days[date.getDay()],
    ddd: days[date.getDay()].slice(0, 3),
    HH: pad(date.getHours()),
    H: String(date.getHours()),
    hh: pad(date.getHours() % 12 || 12),
    h: String(date.getHours() % 12 || 12),
    mm: pad(date.getMinutes()),
    m: String(date.getMinutes()),
    ss: pad(date.getSeconds()),
    A: date.getHours() < 12 ? 'AM' : 'PM',
    a: date.getHours() < 12 ? 'am' : 'pm',
  };
  return format.replace(
    /\[([^\]]*)\]|YYYY|MMMM|dddd|MMM|ddd|YY|MM|DD|HH|hh|mm|ss|Y|M|D|H|h|m|A|a/g,
    (match, literal) => literal ?? tokens[match] ?? match,
  );
}

export const formulaFunctions = [
  'prop',
  'if',
  'ifs',
  'empty',
  'length',
  'substring',
  'contains',
  'test',
  'match',
  'replace',
  'replaceAll',
  'lower',
  'upper',
  'repeat',
  'link',
  'style',
  'unstyle',
  'format',
  'add',
  'subtract',
  'multiply',
  'mod',
  'pow',
  'divide',
  'min',
  'max',
  'sum',
  'median',
  'mean',
  'abs',
  'round',
  'ceil',
  'floor',
  'sqrt',
  'cbrt',
  'exp',
  'ln',
  'log10',
  'log2',
  'sign',
  'pi',
  'e',
  'toNumber',
  'now',
  'today',
  'minute',
  'hour',
  'day',
  'date',
  'week',
  'month',
  'year',
  'dateAdd',
  'dateSubtract',
  'dateBetween',
  'dateRange',
  'dateStart',
  'dateEnd',
  'timestamp',
  'fromTimestamp',
  'formatDate',
  'formatNumber',
  'parseDate',
  'name',
  'email',
  'at',
  'first',
  'last',
  'slice',
  'concat',
  'sort',
  'reverse',
  'join',
  'split',
  'unique',
  'includes',
  'find',
  'findIndex',
  'filter',
  'some',
  'every',
  'map',
  'flat',
  'id',
  'equal',
  'unequal',
  'let',
  'lets',
  'trim',
  'and',
  'or',
  'not',
];

export function validateFormula(expression: string): string | null {
  if (!expression.trim()) return null;
  try {
    const tree = jsep(expression);
    const inspect = (node: Expression) => {
      if (['Compound', 'SequenceExpression', 'ThisExpression'].includes(node.type))
        throw new Error('公式只能包含一个结果表达式');
      if (node.type === 'CallExpression') {
        const callee = (node as jsep.CallExpression).callee;
        const name =
          callee.type === 'Identifier'
            ? (callee as jsep.Identifier).name
            : callee.type === 'MemberExpression' && !(callee as jsep.MemberExpression).computed
              ? ((callee as jsep.MemberExpression).property as jsep.Identifier).name
              : '';
        if (!formulaFunctions.includes(name)) throw new Error(`未知函数：${name || '动态函数'}`);
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value))
          value.forEach((child) => {
            if (child && typeof child === 'object' && 'type' in child) inspect(child as Expression);
          });
        else if (value && typeof value === 'object' && 'type' in value) inspect(value as Expression);
      }
    };
    inspect(tree);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function evaluateFormula(expression: string, context: FormulaContext): FormulaValue {
  if (!expression.trim()) return null;
  const tree = jsep(expression);
  const text = (value: FormulaValue) => formulaText(value, context);
  function run(node: Expression, scope: Scope = {}): FormulaValue {
    switch (node.type) {
      case 'Literal':
        return (node as jsep.Literal).value as FormulaValue;
      case 'Identifier': {
        const name = (node as jsep.Identifier).name;
        if (Object.hasOwn(scope, name)) return scope[name];
        if (context.variables && Object.hasOwn(context.variables, name)) return context.variables[name];
        if (name === 'true') return true;
        if (name === 'false') return false;
        if (name === 'null' || name === 'empty') return null;
        return context.property(name);
      }
      case 'ArrayExpression':
        return (node as jsep.ArrayExpression).elements.map((item) => (item ? run(item, scope) : null));
      case 'UnaryExpression': {
        const expression = node as jsep.UnaryExpression;
        const value = run(expression.argument, scope);
        if (expression.operator === '!' || expression.operator === 'not') return !bool(value);
        if (expression.operator === '-') return -number(value);
        if (expression.operator === '+') return number(value);
        throw new Error('不支持的运算符');
      }
      case 'BinaryExpression': {
        const expression = node as jsep.BinaryExpression;
        const a = run(expression.left, scope);
        if (expression.operator === 'and' || expression.operator === '&&')
          return bool(a) && bool(run(expression.right, scope));
        if (expression.operator === 'or' || expression.operator === '||')
          return bool(a) || bool(run(expression.right, scope));
        const b = run(expression.right, scope);
        switch (expression.operator) {
          case '+': {
            if (typeof a === 'number' && typeof b === 'number') return a + b;
            if (typeof a === 'string' && typeof b === 'string') return a + b;
            const part = (value: FormulaValue): StyledText => {
              if (typeof value === 'string') return { kind: 'text', text: value, styles: [] };
              if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                'kind' in value &&
                value.kind === 'text'
              )
                return value;
              throw new Error('加法需要两个数字，连接文本请使用 format()');
            };
            const left = part(a),
              right = part(b);
            return { kind: 'text', text: left.text + right.text, styles: [], parts: [left, right] };
          }
          case '-':
            return number(a) - number(b);
          case '*':
            return number(a) * number(b);
          case '/':
            if (!number(b)) throw new Error('不能除以零');
            return number(a) / number(b);
          case '%':
            if (!number(b)) throw new Error('不能除以零');
            return number(a) % number(b);
          case '^':
          case '**':
            return Math.pow(number(a), number(b));
          case '==':
          case '===':
            return equal(a, b);
          case '!=':
          case '!==':
            return !equal(a, b);
          case '>':
            return compare(a, b) > 0;
          case '>=':
            return compare(a, b) >= 0;
          case '<':
            return compare(a, b) < 0;
          case '<=':
            return compare(a, b) <= 0;
          default:
            throw new Error(`不支持的运算符：${expression.operator}`);
        }
      }
      case 'ConditionalExpression': {
        const expression = node as jsep.ConditionalExpression;
        return run(bool(run(expression.test, scope)) ? expression.consequent : expression.alternate, scope);
      }
      case 'MemberExpression': {
        const expression = node as jsep.MemberExpression;
        const value = run(expression.object, scope);
        const property = expression.computed
          ? text(run(expression.property, scope))
          : (expression.property as jsep.Identifier).name;
        if (property === 'length' && (Array.isArray(value) || typeof value === 'string')) return value.length;
        if (Array.isArray(value) && /^\d+$/.test(property)) return value[Number(property)] ?? null;
        throw new Error(`不能直接访问 ${property}`);
      }
      case 'CallExpression':
        return call(node as jsep.CallExpression, scope);
      default:
        throw new Error(`不支持的公式语法：${node.type}`);
    }
  }

  function call(node: jsep.CallExpression, scope: Scope): FormulaValue {
    let name: string;
    let receiver: FormulaValue | undefined;
    const args = node.arguments;
    if (node.callee.type === 'Identifier') name = (node.callee as jsep.Identifier).name;
    else if (node.callee.type === 'MemberExpression') {
      const member = node.callee as jsep.MemberExpression;
      if (member.computed) throw new Error('函数名称必须明确');
      name = (member.property as jsep.Identifier).name;
      receiver = run(member.object, scope);
    } else throw new Error('不支持动态函数调用');
    if (!formulaFunctions.includes(name)) throw new Error(`未知函数：${name}`);
    const at = (index: number): FormulaValue => {
      if (receiver !== undefined)
        return index === 0 ? receiver : args[index - 1] ? run(args[index - 1], scope) : null;
      return args[index] ? run(args[index], scope) : null;
    };
    const n = (index: number) => number(at(index));
    const str = (index: number) => {
      const value = at(index);
      if (
        typeof value === 'string' ||
        (value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          'kind' in value &&
          value.kind === 'text')
      )
        return text(value);
      throw new Error(`${name}() 需要文本参数`);
    };
    const count = args.length + (receiver !== undefined ? 1 : 0);
    const requireArgs = (minimum: number, maximum = minimum) => {
      if (count < minimum || count > maximum)
        throw new Error(`${name}() 需要 ${minimum === maximum ? minimum : `${minimum}–${maximum}`} 个参数`);
    };
    if (name === 'prop') {
      if (
        receiver &&
        typeof receiver === 'object' &&
        !Array.isArray(receiver) &&
        'kind' in receiver &&
        receiver.kind === 'page'
      ) {
        if (args.length !== 1) throw new Error('prop() 需要属性名称');
        return context.property(text(run(args[0], scope)), receiver.id);
      }
      requireArgs(1);
      return context.property(str(0));
    }
    if (name === 'if') {
      requireArgs(3);
      return bool(at(0)) ? at(1) : at(2);
    }
    if (name === 'ifs') {
      requireArgs(3, 99);
      for (let i = 0; i < count - 1; i += 2) if (bool(at(i))) return at(i + 1);
      return count % 2 ? at(count - 1) : null;
    }
    if (name === 'and' || name === 'or') {
      requireArgs(2, 99);
      for (let i = 0; i < count; i++) {
        const value = bool(at(i));
        if (name === 'and' && !value) return false;
        if (name === 'or' && value) return true;
      }
      return name === 'and';
    }
    if (name === 'let' || name === 'lets') {
      if (args.length < 3 || args.length % 2 !== 1) throw new Error('let/lets 需要变量名、值和结果表达式');
      const local = { ...scope };
      for (let i = 0; i < args.length - 1; i += 2) {
        if (args[i].type !== 'Identifier') throw new Error('变量名无效');
        local[(args[i] as jsep.Identifier).name] = run(args[i + 1], local);
      }
      return run(args[args.length - 1], local);
    }
    if (['map', 'filter', 'find', 'findIndex', 'some', 'every'].includes(name)) {
      requireArgs(2);
      const source = list(at(0));
      const expression = args[receiver === undefined ? 1 : 0];
      const evaluate = (current: FormulaValue, index: number) =>
        run(expression, { ...scope, current, index });
      if (name === 'map') return source.map(evaluate);
      if (name === 'filter') return source.filter((value, index) => bool(evaluate(value, index)));
      if (name === 'find') return source.find((value, index) => bool(evaluate(value, index))) ?? null;
      if (name === 'findIndex') return source.findIndex((value, index) => bool(evaluate(value, index)));
      if (name === 'some') return source.some((value, index) => bool(evaluate(value, index)));
      return source.every((value, index) => bool(evaluate(value, index)));
    }
    if (['min', 'max', 'sum', 'mean', 'median'].includes(name)) {
      requireArgs(1, Infinity);
      const values: number[] = [];
      const collect = (value: FormulaValue) => {
        if (Array.isArray(value)) value.forEach(collect);
        else values.push(number(value));
      };
      for (let i = 0; i < count; i++) collect(at(i));
      if (!values.length) return 0;
      if (name === 'min') return Math.min(...values);
      if (name === 'max') return Math.max(...values);
      if (name === 'median') {
        values.sort((a, b) => a - b);
        const middle = Math.floor(values.length / 2);
        return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
      }
      const sum = values.reduce((a, b) => a + b, 0);
      return name === 'mean' ? sum / values.length : sum;
    }
    if (name === 'now' || name === 'today') {
      requireArgs(0);
      const date = new Date(context.now || Date.now());
      if (name === 'today') date.setHours(0, 0, 0, 0);
      return date;
    }
    if (name === 'pi' || name === 'e') {
      requireArgs(0);
      return name === 'pi' ? Math.PI : Math.E;
    }
    if (name === 'id') {
      requireArgs(0, 1);
      const value = at(0);
      return value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        'kind' in value &&
        value.kind === 'page'
        ? value.id
        : context.pageId;
    }
    const unaryMath: Record<string, (n: number) => number> = {
      abs: Math.abs,
      ceil: Math.ceil,
      floor: Math.floor,
      sqrt: Math.sqrt,
      cbrt: Math.cbrt,
      exp: Math.exp,
      ln: Math.log,
      log10: Math.log10,
      log2: Math.log2,
      sign: Math.sign,
    };
    if (unaryMath[name]) {
      requireArgs(1);
      const result = unaryMath[name](n(0));
      if (!Number.isFinite(result)) throw new Error('计算结果不是有效数字');
      return result;
    }
    switch (name) {
      case 'empty':
        requireArgs(1);
        {
          const value = at(0);
          return (
            value === null ||
            value === '' ||
            value === 0 ||
            value === false ||
            (Array.isArray(value) && value.length === 0)
          );
        }
      case 'not':
        requireArgs(1);
        return !bool(at(0));
      case 'format':
        requireArgs(1);
        return text(at(0));
      case 'length':
        requireArgs(1);
        {
          const value = at(0);
          return Array.isArray(value) ? value.length : str(0).length;
        }
      case 'substring':
        requireArgs(2, 3);
        return str(0).substring(n(1), count > 2 ? n(2) : undefined);
      case 'contains':
        requireArgs(2);
        return str(0).includes(str(1));
      case 'test':
        requireArgs(2);
        return new RegExp(str(1)).test(str(0));
      case 'match':
        requireArgs(2);
        return str(0).match(new RegExp(str(1), 'g')) || [];
      case 'replace':
      case 'replaceAll':
        requireArgs(3);
        return str(0).replace(new RegExp(str(1), name === 'replaceAll' ? 'g' : ''), str(2));
      case 'lower':
        requireArgs(1);
        return str(0).toLowerCase();
      case 'upper':
        requireArgs(1);
        return str(0).toUpperCase();
      case 'trim':
        requireArgs(1);
        return str(0).trim();
      case 'repeat':
        requireArgs(2);
        return str(0).repeat(n(1));
      case 'link':
        requireArgs(2);
        return { kind: 'text', text: str(0), styles: [], href: str(1) };
      case 'style':
        requireArgs(2, 30);
        {
          const value = at(0);
          const old =
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            'kind' in value &&
            value.kind === 'text'
              ? value
              : { kind: 'text' as const, text: str(0), styles: [] };
          return {
            ...old,
            styles: [...new Set([...old.styles, ...Array.from({ length: count - 1 }, (_, i) => str(i + 1))])],
          };
        }
      case 'unstyle':
        requireArgs(1, 30);
        {
          const value = at(0);
          if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            !('kind' in value) ||
            value.kind !== 'text'
          )
            return str(0);
          return count === 1
            ? value.text
            : {
                ...value,
                styles: value.styles.filter(
                  (style) => !Array.from({ length: count - 1 }, (_, i) => str(i + 1)).includes(style),
                ),
              };
        }
      case 'add':
        requireArgs(2);
        return n(0) + n(1);
      case 'subtract':
        requireArgs(2);
        return n(0) - n(1);
      case 'multiply':
        requireArgs(2);
        return n(0) * n(1);
      case 'divide':
      case 'mod':
        requireArgs(2);
        if (!n(1)) throw new Error('不能除以零');
        return name === 'divide' ? n(0) / n(1) : n(0) % n(1);
      case 'pow':
        requireArgs(2);
        return Math.pow(n(0), n(1));
      case 'round':
        requireArgs(1, 2);
        {
          const scale = Math.pow(10, count === 2 ? n(1) : 0);
          return Math.round(n(0) * scale) / scale;
        }
      case 'toNumber':
        requireArgs(1);
        {
          const value = at(0);
          const result =
            value instanceof Date
              ? value.getTime()
              : typeof value === 'string'
                ? parseFloat(value)
                : Number(value);
          if (!Number.isFinite(result)) throw new Error('无法转换为数字');
          return result;
        }
      case 'parseDate':
        requireArgs(1);
        return parseFormulaDate(at(0));
      case 'dateAdd':
      case 'dateSubtract':
        requireArgs(3);
        return addDate(at(0), n(1) * (name === 'dateSubtract' ? -1 : 1), str(2));
      case 'dateBetween':
        requireArgs(3);
        return dateDifference(at(0), at(1), str(2));
      case 'dateRange':
        requireArgs(2);
        return { kind: 'dateRange', start: parseFormulaDate(at(0)), end: parseFormulaDate(at(1)) };
      case 'dateStart':
      case 'dateEnd':
        requireArgs(1);
        {
          const value = at(0);
          return value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            'kind' in value &&
            value.kind === 'dateRange'
            ? name === 'dateStart'
              ? value.start
              : value.end
            : parseFormulaDate(value);
        }
      case 'timestamp':
        requireArgs(1);
        return parseFormulaDate(at(0)).getTime();
      case 'fromTimestamp':
        requireArgs(1);
        {
          const date = new Date(n(0));
          date.setSeconds(0, 0);
          return date;
        }
      case 'formatDate':
        requireArgs(2);
        return formatDate(at(0), str(1));
      case 'formatNumber':
        requireArgs(1, 3);
        {
          const style = count > 1 ? str(1).toLowerCase() : 'number';
          const digits = count > 2 ? n(2) : undefined;
          return new Intl.NumberFormat('en-US', {
            ...(style === 'percent'
              ? { style: 'percent' }
              : style === 'number' || style === 'comma'
                ? {}
                : { style: 'currency', currency: style.toUpperCase() }),
            ...(digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
          }).format(n(0));
        }
      case 'minute':
      case 'hour':
      case 'day':
      case 'date':
      case 'week':
      case 'month':
      case 'year': {
        requireArgs(1);
        const date = parseFormulaDate(at(0));
        if (name === 'minute') return date.getMinutes();
        if (name === 'hour') return date.getHours();
        if (name === 'day') return date.getDay() || 7;
        if (name === 'date') return date.getDate();
        if (name === 'month') return date.getMonth() + 1;
        if (name === 'year') return date.getFullYear();
        const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
        return Math.ceil(((utc.getTime() - Date.UTC(utc.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
      }
      case 'name':
      case 'email':
        requireArgs(1);
        {
          const value = at(0);
          if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            !('kind' in value) ||
            value.kind !== 'person'
          )
            throw new Error('需要人员类型');
          return value[name];
        }
      case 'at':
        requireArgs(2);
        return list(at(0))[n(1)] ?? null;
      case 'first':
        requireArgs(1);
        return list(at(0))[0] ?? null;
      case 'last':
        requireArgs(1);
        return list(at(0)).at(-1) ?? null;
      case 'slice':
        requireArgs(2, 3);
        return list(at(0)).slice(n(1), count > 2 ? n(2) : undefined);
      case 'concat':
        requireArgs(1, 99);
        return Array.from({ length: count }, (_, i) => list(at(i))).flat();
      case 'sort':
        requireArgs(1);
        return [...list(at(0))].sort(compare);
      case 'reverse':
        requireArgs(1);
        return [...list(at(0))].reverse();
      case 'join':
        requireArgs(2);
        return list(at(0)).map(text).join(str(1));
      case 'split':
        requireArgs(2);
        return str(0).split(str(1));
      case 'unique':
        requireArgs(1);
        return list(at(0)).filter(
          (value, index, values) => values.findIndex((other) => equal(value, other)) === index,
        );
      case 'includes':
        requireArgs(2);
        return list(at(0)).some((value) => equal(value, at(1)));
      case 'flat':
        requireArgs(1);
        return list(at(0)).flat();
      case 'equal':
        requireArgs(2);
        return equal(at(0), at(1));
      case 'unequal':
        requireArgs(2);
        return !equal(at(0), at(1));
      default:
        throw new Error(`尚未实现的公式函数：${name}`);
    }
  }
  const result = run(tree);
  if (typeof result === 'number' && !Number.isFinite(result)) throw new Error('计算结果不是有效数字');
  return result;
}
