# Interface language

Application settings → Interface language selects English (`en`) or Simplified Chinese
(`zh-CN`). It applies immediately and is persisted by the existing Core settings API.
The same preference is used by desktop and authenticated browser clients. Stores without
a language preference default to English. CLI: `agents settings set --language zh-CN`.

The company navigation, Common canvas controls, Messages, Plan, employee/team forms,
settings, app-owned menus, accessible labels, and display dates consume a shared renderer
catalog. Browser-hosted folder pickers and plugin window controls update with the same
preference. Browser storage caches only the language code for startup/sign-in rendering;
authenticated Core preferences remain authoritative.

Translations are explicitly attached to product copy. They do not scan or replace DOM
text. Employee/Team names, custom view names, messages, prompts, files, model identifiers,
external engine output, third-party forms and raw diagnostics retain their content.
Translated select options retain explicit original API values. Keyboard commands and
machine-readable protocols do not change with the interface language.

## Verification

- `Infra/src/test/language-core-test.mjs`: validated values, CLI parity, restart persistence and
  unchanged employee/Team state.
- `Infra/src/test/language-ui-test.mjs`: actual settings picker, English/Chinese switching, messages,
  menus, emoji search, dates, Plan, forms, mention routing values, reload and unchanged user
  content. A paused schedule verifies that localized reasoning labels still submit `high`.
- `Infra/src/test/language-web-test.mjs`: authenticated browser choice, cross-tab synchronization,
  390px Chinese layout, reload, host folder picker and no token in browser storage.
- `Infra/src/test/language-coverage-test.mjs`: nonempty catalog entries, interpolation consistency,
  known literal call sites and explicit values on translated select options.

Plugin-owned application interiors (MiniNotion, Margin Reader and Cloud Hosts) have their
own renderers. Their language propagation/localization has not been accepted as part of
this pass. Host controls are localized; this document does not claim those independent
interfaces or operating-system dialogs are fully bilingual. The continuing product audit
tracks that gap, alongside the remaining Message parity work.

## Adding interface copy

Use `uiText` from the renderer i18n module for product-owned copy and subscribe the React
component with `useI18n()`. Parameters (`{0}`, `{1}`) interpolate user data without translating
it. Display dates use `interfaceLocale()`; semantic timestamps/time zones stay unchanged.
Never localize API command names, enum values, React keys, identifiers, file paths or user
content. New translations must preserve the parameter set and pass the coverage check.
