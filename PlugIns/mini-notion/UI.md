# MiniNotion presentation architecture

Presentation changes preserve page identities, workspace layout and existing domain behavior.

## Shared implementation

`src/styles/foundation.css` owns application colors, control sizes, focus, radius and motion tokens. Domain styles consume these tokens instead of adding another global button theme.

`src/ui.tsx` owns shared buttons, icon rendering and modal/popover behavior. Failed image icons retain a stable fallback slot. Decorative glyphs do not repeat their parent's accessible label.

`src/presentation.ts` owns cover URL/preset projection and viewport-bounded surface geometry. Page, home and database previews share it.

`src/components/AppSelect.tsx` keeps a native select for form values and supplies the visible keyboard-operated listbox. Escape closes the innermost control first.

`src/appearance.ts` owns semantic color derivation. Page layout responds to the main pane's width; floating menus respond to the viewport.

## Change discipline

Edit an existing component or rule before adding an override. Remove superseded declarations in the identical selector and scope. Keep print and responsive scopes independent. Do not remove dynamic classes based only on literal string search.

Measure source bytes as well as statement/rule counts. Moving styles or minifying lines does not reduce implementation complexity. Prefer small shared primitives over dependencies or duplicate implementations.

## Verification

`npm --prefix PlugIns/mini-notion test` includes cover/geometry tests and renders every declared vector icon in both themes. The existing 198-method service coverage gate remains active.

`npm run test:mininotion-ui` includes `test/mininotion-visual-ui-test.mjs`. It uses an isolated hidden desktop and checks both themes, ten database views, narrow/wide panes, cover pickers, image fallback, titles after resize, nested rows, modal/select dismissal, side/center peeks and short windows. Screenshots and measured bounds are saved under test artifacts. Intentional entrance animations and cover-edge icon placement are distinguished from accidental overlap.

Cold start and editing/quit workloads remain separate: `test/mininotion-startup-ui-test.mjs` and `test/mininotion-performance-ui-test.mjs`. Tests do not edit production notes. Passing these bounded scenarios does not certify pixel equality to Notion, every possible visual combination or untested platforms.

## Color themes (1.22)

`src/core/colorThemes.ts` is the single palette registry for CLI schema and GUI choices.
`appearance.ts` derives light/dark surfaces, readable text, button endpoints and card
colors. `ThemeSettings.tsx` reuses these exact tokens in its miniature previews; the
old three large theme previews and their CSS were removed, not layered underneath.
`styles/themes.css` owns only optional expressive chrome, wallpaper and finite effects.
No new packages, remote images, animation runtimes or perpetual JavaScript loops are used.

`settings.appearance.palette`, `wallpaper` and `motion` are optional. Existing settings
continue to work, and selecting `classic` or resetting appearance restores a plain
presentation. Choosing a preset resets its accent/surface/wallpaper combination, while
retaining density, motion and Agent options. Custom colors can then override the preset.
System reduced motion always wins. User-selected reduced motion also disables the
presentation effects; no input/content state is keyed by the selected theme.

`tests/color-themes.test.ts` checks token contrast, invalid inputs, legacy settings,
CLI schema and native-file preservation across service restart. The hosted visual
suite reuses `test/fixtures/mininotion-color-themes.mjs` to check all eight palettes in
both tones, wallpaper choices, keyboard navigation, persistence, no editor remount
and finite/reduced animations. This is visual inspiration from Telegram's paired
color themes and optional effects, not a claim of pixel parity or messaging features.
