# 插件源码

一个插件一个文件夹，宿主只通过 `PLUGIN_SPEC.md` 中定义的 CLI、JSON-RPC、manifest 和渲染接口使用插件。

- `mini-notion/`：MiniNotion 的完整源码、CLI、渲染器、测试、文档和许可证。
- `../build/plugins/<folder>/`：可重新生成的独立插件包，打包后进入 App 的 `Resources/plugins/`。
- 用户工作文件位于 `~/develop/Agents-company-workspace/`，不放在源码或插件包中。

```sh
npm --prefix PlugIns/mini-notion ci
npm run build:plugins
npm run build
npm run app
```

新增插件时，在这里新建自己的文件夹。其 `package.json` 提供 `build:plugin` 脚本，接受
`--out <absolute-directory>`，输出标准 `agents-company.plugin.json`、CLI、API Markdown、
JSON schema 和渲染入口。根目录构建脚本自动发现这些插件，不需改宿主业务代码。

MiniNotion 保留原有独立运行代码，以便复用和测试；本项目的交付形式是宿主内插件，
不会安装它的独立 macOS App。历史用户数据归档在应用数据目录，未混入这里。
# Git ownership

Each `PlugIns/<name>/` source directory is its own Git repository. The Agents
Company repository ignores plugin source trees; it tracks only this integration
guide and the shared plugin contract. Run `git -C PlugIns/<name> status` and commit
inside that plugin when changing its code. A clean checkout of the host needs
each plugin repository checked out at the same path before `npm run build:plugins`.
