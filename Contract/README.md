# Aexus Contract

Contract 1.0.0 是业务 Engine 调用 Infra 的独立边界，内容包括：

| 文件 | 用途 |
| --- | --- |
| `PROTOCOL.md` | 认证、请求/响应、版本、流式读取、错误与重试规则 |
| `ENGINE_GUIDE.md` | 新 Engine 的文件结构、页面、CLI、验收要求 |
| `protocol.ts` | 前端/共享 TypeScript 客户端与 DTO |
| `node-client.mjs` | 无 shell 的 CLI 客户端；JSON 经 stdin，权限继承原环境 |
| `commands.v1.json` | 明确导出的 Core 能力和参数目录 |
| `policy.ts` | 版本清单生成规则，含不公开的敏感操作 |
| `engine.ts` / `engine.schema.json` | Engine manifest 类型与运行时检查 |
| `request.schema.json` | `contract.call` 参数结构 |

Engine 只能依赖 Contract，不依赖 Infra 内部组件或数据库。Infra 负责认证与执行，Engine 负责领域目标和验收结果。Contract 不代表更高权限，不自动重试多步工作，也不承诺所有操作在同一个事务中完成。

本版导出 Company、Messages、Plan、文件与执行能力，不导出插件命令、凭据签发/撤销、凭据原文读取、收费探针和自动安装。`session.follow` 使用专用流式入口，不通过单响应 `contract.call`。

`commands.v1.json` 明确标识 `schemaSource`。已有精确 schema 的命令返回其原定义；少量旧接口仍标记 `legacy-documentation`，这类接口的完整参数必须查阅 Infra API 文档，不能把通配对象当成任意可用字段。

更新 Infra API 后执行 `npm run contract:sync` 并审查清单差异；普通构建/验收使用 `npm run contract:check`，不悄悄更新已发布接口。破坏兼容的请求、响应或行为改动必须新增协议大版本；新 Engine 必须声明自己支持的版本和 requiredCommands。
