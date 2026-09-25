## 开始工作

这是由根 API、调度规范和注册表生成的**全局参考手册**。员工实际应阅读工作目录中按自己 ID 生成的 API.md / PERMISSIONS.md，或执行 `agents auth whoami --json` 与 `agents api docs`，不能将参考手册当作权限凭据。

Manager 必须是本地运行的员工，可属于普通 Build 或 Work Team。SSH Build 中的本地 Manager 使用身份绑定的回传 CLI。目录名称不决定身份，不需要绑定到特殊的 Agents-Managers 文件夹。

创建本项目员工用 `agents card create --title NAME --engine codex --json`。普通 Manager 省略 group 时使用自己的 Team；创建成功会自动建立有效箭头。随后使用真实员工 ID 调用 `session send --employee ID --text TEXT`、`session transcript --employee ID`、`session interrupt --employee ID`。引擎内置子 Agent 不能替代公司员工。

同 Team 的已有 Employee 需要申请关系并等待批准。普通 Manager 只能管理有效关系目标，删除额外要求是自己创建的员工。全局 API 仅用于明确获得全局授权的 Agents Manager。用户授予全局权限使用 `agents management global ID on`。

Team 可改名且目录不变；员工名称不可改。所有业务修改通过 CLI，不直接修改宿主状态文件。返回 `{ok:true,data}` 表示调用成功，发送消息的成功只表示被接受，完成状态应继续通过项目 API 确认。
