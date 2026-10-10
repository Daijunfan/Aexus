# Deliverables

`ComparisonCharts.tsx` extends the existing editable comparison matrix; Workspace owns its placement through `workspace/ResearchComparisonPanel.tsx`. Both the live bars and the exported bars consume `projectComparisonCharts` in `matrix-charts.ts`: no second editor, research store, unit conversion or numeric invention.

Only clear non-negative numeric values with literal matching units are plotted. If one unit group has at least two values and uniquely dominates the row, excluded values are clearly marked; tied unit groups and unlabelled mixed-unit rows are not plotted. Unknown cells are omitted, never treated as zero. Negative values, date/identifier fields, estimates, numeric ranges, unsafe-sized integers, incompatible units and textual comparisons remain in the source matrix. The projection is display-only: table cells have no independent per-cell citation guarantee.

The view initially renders four charts, then reveals up to twelve per click, with a local metric/candidate/value search. The `导出全部图表与矩阵（HTML）` control downloads a self-contained, mobile/print-friendly file with **all** safe charts (including those not currently displayed or filtered) and the unabridged relevant matrices, including omitted text and unknown cells. HTML content is escaped, no external assets or scripts are loaded, and an 8 MiB download guard surfaces failure to the user. The separate `导出矩阵原值（CSV）` action exports **all matrices, including text-only ones**, as long-form UTF-8 BOM/CRLF rows (matrix ID, title, dimension, candidate, raw value). Blank and user-edited cells are retained; spreadsheet-formula-like inputs are prefixed with an apostrophe for safer import. A text-only comparison still exposes CSV even when no charts can be displayed. User-edited matrix state remains managed by the existing page, unchanged.

Verification from the repository root:

```sh
node --test Engine/deep-research/deliverables/*.test.mjs
./node_modules/.bin/tsc --noEmit --project tsconfig.json
```

Evidence and finding semantics belong to `knowledge/`; targeted follow-up state and merging belong to `workflow/`. Persisting user edits across devices and native PDF/DOCX generation require separate cross-owner design and are **not** claimed as implemented here.
