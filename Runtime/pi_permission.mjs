// Native Pi tool-approval gate for cloud sessions in "ask" permission mode.
//
// Loaded ONLY via an explicit `--extension <this-file>` at launch for ask-mode
// sessions, so the Full native path is untouched (no extension, no gate).
//
// Uses the official Pi extension API (verified against the installed package
// @earendil-works/pi-coding-agent, both local 0.87.1 and remote 1.2.0):
//   - `pi.on("tool_call", handler)` fires before a tool executes; the handler
//     may return `{ block: true, reason }` to stop it or `undefined` to allow.
//   - `ctx.ui.confirm(title, message)` is the native interactive approval dialog
//     (TUI and RPC forward it); `ctx.hasUI` is false in `print`/`json` modes.
// This mirrors Pi's own shipped example `examples/extensions/permission-gate.ts`.
// No prompt injection, no fake CLI flags, no tool removal.
export default function (pi) {
  // Mutating tools and command execution require approval in Ask mode.
  // Read-only tools (read, ls, find, grep) stay ungated.
  const gated = new Set(['write', 'edit', 'bash', 'powershell']);

  pi.on('tool_call', async (event, ctx) => {
    if (!gated.has(event.toolName)) return undefined;

    const raw = event.input?.command ?? event.input?.path ?? event.input?.filePath ?? '';
    const summary = (typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, 240);

    // print/json modes have no UI (docs: "JSON and print modes have no UI"),
    // so there is nothing to approve with — fail closed rather than execute.
    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Ask permission mode: no interactive UI to approve ${event.toolName}${summary ? ': ' + summary : ''}`,
      };
    }

    const approved = await ctx.ui.confirm(`Approve ${event.toolName}?`, summary || '(no arguments)');
    if (!approved) return { block: true, reason: `${event.toolName} not approved by user` };
    return undefined; // allow
  });
}
