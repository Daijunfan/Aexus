# Mini Notion 文件化工作区改造与验收

> 本文记录前一轮 1.17.2 候选改造。1.18.0 已补齐宿主接入、标准构建、默认集合视图及宿主测试；当前使用说明见 `../../docs/MININOTION_WORKSPACES.md`，新验收记录见宿主 `artifacts/mininotion-host-integration/`。下文“未修改宿主”及候选包接入限制仅描述前一轮历史。

## 交付范围

本轮仅修改 `PlugIns/mini-notion`。未修改宿主 Core、其他插件或宿主锁文件，未迁移实际工作区，未安装或覆盖正式 Agents Company / Mini Notion 应用。沿用当前插件版本号 1.17.2；这是当前源码的候选构建，不是已发布的新版本。

用户与员工不再需要两套页面存储。新主页面对应一个实际文件夹，原生页面、数据库、记录、模板、同页同步块及其引用的本地附件可由该目录的 CLI 工作区读取。用户 UI 与员工 CLI 经过同一后端保存机制，而不是仅在界面伪造目录关系。

## 文件模型

```text
workspaces/<Team 创建时名称>/
  <主页面目录>/
    index.mininotion.json
    <子页面-id>.mininotion.json
    <孙页面-id>.mininotion.json
    <数据库-id>.mininotion.json
    <记录-id>.mininotion.json
    notes.md
    .mininotion/
```

原生文件格式仍为 `{"format":"mininotion.page/v1","page":{...}}`。层级由 `parentId` 表示，后代文件不必逐层嵌套物理文件夹。数据库定义、视图与属性留在完整 JSON 内，不经有损 Markdown 转换。

创建时有标题的主页面使用清理后的标题作为目录名；重名自动增加后缀。GUI 新建空白页面可能先生成 `Untitled-<id前缀>` 目录。之后改标题不会移动目录，以免破坏员工 cwd。必须使用 `fs.path` 查询真实路径，不能按新标题猜测。

已绑定的嵌套主页面目录保留原位置。显式移动子树会改变其原生文件所在范围，但不删除空目录或无关用户文件。

## 已实现的接口和界面

| 入口 | 行为 |
| --- | --- |
| `fs.path {pageId}` | 返回实际文件、相对目录、绝对目录及主页面信息 |
| `fs.info` | 返回工作区、布局版本、主页面目录清单、索引错误 |
| `fs.bind {path,title?,color?}` | 将已有目录提升为可编辑主页面；重复操作不覆盖已有主页面 |
| `fs.organize {dryRun?}` | 默认只预览旧布局移动计划；显式 `dryRun:false` 执行 |
| 主页面顶部文件夹信息 | 显示真实目录，可复制员工绑定目录 |
| 普通目录中的“作为主页面编辑” | 调用相同 `fs.bind`，保留已有文件 |
| 侧栏“工作区页面” | 不再用“个人页面”区分人的内容与 Agent 内容 |

员工目录绑定复用宿主现有机制：Work 员工绑定 Team 根目录下的已有子目录；多个员工可绑定不同子目录。没有另建人/Agent 业务权限系统，也没有绕过宿主原有的工作区范围规则。插件的命令 schema 与 API 文档包含新接口，员工引导文档由宿主正常分发。

对于跨主页面的数据库引用、关联或同步内容，仍保持单一引用目标；需要同时编辑两端时使用包含双方的上级工作区，而不是制造多份可写数据库。

## 数据可靠性

保存先校验完整写入集合的文件哈希，在物理目录上协调父/子作用范围的并发写入，使用唯一临时文件及原子文件替换。写入或缓存保存抛错时回滚已写文件；忙碌、冲突、回滚失败分别返回明确错误，不静默覆盖。

这不是断电级跨文件事务承诺。突然终止后仍应重新扫描并检查 `fs.sync.errors`。插件不能锁住不遵守约定的第三方编辑器。

同时修复了同字节文件删除后重新出现不能恢复索引，以及超过 4 MB 的原始文件无法按页面执行回收/恢复的问题。文本编辑接口维持 4 MB 限制；大文件可由本地工具操作。

本地附件保存到所属主页面文件夹内的隐藏资源存储，员工无需向父目录寻找附件。旧布局不自动搬动；删除页面不会删除员工的整个目录。

## 实际测试结果

测试全部使用临时数据、隐藏窗口和隔离的宿主状态；没有调用付费模型，没有向生产工作区写入验收页面。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 160 项通过，0 失败、0 跳过 |
| 新文件工作区单测 | 包含在 160 项内；主页面目录、160 层页面树、9 种数据库视图、移动/复制、模板/同步块、员工作用范围、附件、旧布局、错误回滚、大文件生命周期 |
| `npm run build:plugin` | 通过，产物 `dist-plugin/` |
| `npm run test:workspace-ui` | 6 组通过；真实宿主新 Team、真实临时员工绑定、真实员工启动器、GUI/CLI 双向编辑、看板、导出、目录提升、重开 |
| `scripts/test-local-ui.mjs`，指定候选插件包 | 13 组通过；图标、图片、封面、主题、菜单、四类数据库 UI、窄窗及重开 |
| `scripts/test-editing-ui.mjs`，指定候选插件包 | 12 组通过；LaTeX、搜索、块链接调用、快捷键、多块操作、书签、标签页、CLI 修改后定位 |
| `npm run build` | 独立应用前端/后端构建通过 |
| `npm run test:folder-ui` | 文件夹模式、原生模式、两种数据隔离检查通过 |

宿主界面测试合计 31 组。测试没有观察到 renderer 异常或外部网络请求。现有 Claude 适配器动态导入导致的 7 处隐式 any 类型错误也已在插件内修复，保留官方 SDK 类型约束。

### 明确未验收的内容

隐藏运行环境中，原生 Electron 直接写入再读取系统剪贴板也返回空值。因此默认隐藏 UI 测试使用确定性的 Clipboard API 写入捕获，严格断言链接/绑定目录的实际参数，但不声称系统剪贴板集成通过。`MINI_NOTION_SYSTEM_CLIPBOARD=1` 可单独开启原来的系统剪贴板验收。

未运行真实 Codex/Claude 模型推理、Windows/Linux 桌面测试、正式安装包升级或断电恢复测试。上述通过结果不等于声称商业 Notion 的每项功能、每种数据规模和每个平台都已完全验收。

宿主 `PLUGIN_SPEC.md` 的 Mini Notion 历史示例与 `test/plugin-test.mjs` 仍提到/断言旧 `Documents` 路径。这两处在用户限定的修改范围之外，未改动，也未宣称宿主全量测试全部通过。新 `test-workspace-ui.mjs` 实际加载候选包，通过宿主公开 CLI、schema、团队、员工与窗口接口验证新布局。

## 使用

在新包加载后，在 Team 插件界面创建主页面，展开其顶部“主页面文件夹”，复制真实目录；新建 Work 员工时选择“绑定已有文件夹”并使用该路径。旧员工已有目录也可在文件夹页面点“作为主页面编辑”。

员工自身启动器示例：

```sh
mininotion api fs.bind --data '{"path":".","title":"项目知识库","color":"white"}'
mininotion api fs.info
mininotion api page.create --data '{"parentId":"上一步返回的主页面ID","title":"设计说明","color":"white"}'
mininotion api fs.path --data '{"pageId":"返回的页面ID"}'
```

保留主页面 ID，创建后代时传入 `parentId`。不传父级表示新建另一个主页面及其目录。

旧 `Documents` 内容迁移前先关闭旧客户端并备份整个工作区，包括隐藏目录：

```sh
mininotion api fs.organize --data '{"dryRun":true}'
# 检查计划和旧员工绑定后，再明确执行：
mininotion api fs.organize --data '{"dryRun":false}'
```

本轮没有对用户的实际旧文件执行以上迁移。迁移后回滚应在插件关闭时还原完整备份，不能只还原缓存 JSON。

## 复验与证据

```sh
cd /Users/djf/develop/CS/Agents-company/PlugIns/mini-notion
npm run typecheck
npm test
npm run build:plugin
npm run test:workspace-ui
AGENTS_COMPANY_PLUGIN_DIRS="$PWD/dist-plugin" \
  AGENTS_COMPANY_TEST_ARTIFACTS="$PWD/.local-data/folder-layout-results/compat-ui" \
  npm run test:local-ui
AGENTS_COMPANY_PLUGIN_DIRS="$PWD/dist-plugin" \
  AGENTS_COMPANY_TEST_ARTIFACTS="$PWD/.local-data/folder-layout-results/editing-ui" \
  npm run test:editing-ui
```

日志和截图位于 `.local-data/folder-layout-results/`。其中截图中的 `/private/tmp/...` 是已清理的隔离测试目录，不是可绑定的生产目录。`changed-files.json` 记录源码变更范围；`.local-data/folder-layout-before/` 保存本轮开始时的源码基线及哈希。

候选包位于 `dist-plugin/`；正式应用尚未安装此包。宿主需通过正常构建/安装流程加载它，或在开发启动时使用 `AGENTS_COMPANY_PLUGIN_DIRS` 指向该目录。没有修改宿主的内置插件目录来绕过本轮开发范围。
