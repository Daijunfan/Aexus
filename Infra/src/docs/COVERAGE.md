# CLI / GUI parity

All business actions go through `handleRequest` in `Infra/src/main/server.ts`.
The Electron preload exposes one generic request method, not separate domain
handlers. `test:coverage` checks actual frontend command strings against the CLI,
server cases, and protocol registry. Runtime tests exercise the same handler.

| UI operation | CLI operation |
| --- | --- |
| Add idle employee / choose engine, department, workspace | `card create --engine ... --group ... --cwd ...` |
| Entire character / workstation | `session open` |
| Employee appearance / role / accessory | `card update` |
| Read all current frontend state | `session list --live` / `session snapshot` |
| Rename / move / reorder / remove employee | `card rename` / `card move [--before ...]` / `card remove` |
| Add / rename / delete department | `group add` / `group rename` / `group remove` |
| Replace wall, desk, palette, and decorations | `room design` |
| Move, resize, reshape Teams and arrange employees | `room bounds` / `room layout` |
| Freely place a workstation | `card place` |
| Pan and zoom the viewport | `canvas view` / `canvas set` |
| Bind the required external Team folder | `group add --root` / `group root` |
| Send / stop / close conversation | `session send` / `session interrupt` / `session close` |
| Model / permissions / thinking / effort | `config model` / `config permission` / `config thinking` / `config effort` |
| Read / follow transcript | `session transcript [--thinking]` / `session follow` |
| List / filter / complete Claude commands | `commands list [--filter ...]` / `commands complete` |
| View / answer Claude permission requests | `approval list` / `approval respond` |
| Inspect appearance and interactions | `ui view`, `dom`, `click`, `type`, `wait`, `style`, `screenshot` |

View selection, opening panels, and draft text are presentation state; they
perform no independent domain operation. The `ui.*` commands can inspect and
drive them when a renderer is present.

`test:core` covers process failures, cancellation, and approval lifecycle without
model calls. `test:headless` uses the real engines through the Node service.
`test:ui` checks the real offscreen renderer and CLI-to-UI synchronization, with
no inference. Every test owns a temporary home; existing user data is untouched.

The live floor has only department sign and employee buttons. Two add buttons
live in the header. There is no separate Team view, no screenshot backdrop, and
no automatic session opening on hire. UI acceptance exercises clicks on the SVG
character itself, edit persistence, working/sleeping animation styles, and the
conversation overlay while the office stays mounted.

Directory ownership is tested at creation and on turn submission, including
symlink escapes. Hidden-renderer acceptance dispatches actual pointer and wheel
events and verifies world-coordinate translation under zoom, free placement,
Team expansion with fixed-size employees, and saved polygon control points.
