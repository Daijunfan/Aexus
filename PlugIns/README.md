# Bundled plugins

The first source and desktop/server distribution includes all three maintained plugins:

| Plugin | Directory | License |
| --- | --- | --- |
| Cloud Hosts | `cloud-hosts/` | Apache-2.0 |
| MiniNotion | `mini-notion/` | GPL-3.0-only |
| Margin Reader | `margin-reader/` | MIT |

All source trees are part of the host checkout. Their previous local Git histories were preserved separately during integration; runtime workspaces, dependency directories and build outputs remain excluded. `plugins.lock.json` pins the versions expected by the host.

```sh
npm ci
npm run setup
npm run build:plugins
# Portable release artifacts omit developer-machine source paths:
npm run build:plugins:release
```

The builder fails if a required plugin is missing or has an unreviewed version mismatch. Each plugin keeps its documented CLI, runtime, UI, schema and license. New public-release workspaces live under Core data storage; existing Team/workspace bindings are not moved. See `PLUGIN_SPEC.md`, `LICENSING.md` and `docs/DEPLOYMENT.md`.
