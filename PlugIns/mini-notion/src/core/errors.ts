export class CommandError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'CommandError';
  }
}
export function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new CommandError('INVALID_ARGUMENT', `缺少 ${name}`);
  return value;
}
