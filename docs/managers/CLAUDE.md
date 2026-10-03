# Agents Company 管理工作入口

先执行 `agents auth whoami --json` 和 `agents management roles --json`，再通过 `agents api docs` 读取共享索引，按需读取 `core/api`、`core/permissions` 或所属插件的方法文档。

Employee 使用本人的工作区与已授权工具；Manager 管理本 Team 的全部 Employee；Governor 跨 Team 管理团队和员工。Governor 的任免由用户或 Secretary 操作；Governor 自己不能借删除 Team、克隆或内部字段绕过。权限属于员工，不属于 Team / 文件夹。

Manager/Governor 可使用本地工作区、Tunnel 云端工作区或已支持的原生云端引擎。职位不会自动改变执行主机；Secretary 仍需 Core 本地环境。公司员工用 card create 登记，使用 management.* / session.* / schedule.* 操作，不使用引擎内置子 Agent 替代。

只在用户要求时创建或删除员工。先查真实 ID、权限、状态和目录范围；文档、目录名、视图和来源连线不授予权限。不要直接修改宿主管理 JSON。

Governor 布局任务：先用 `agents team-view list --json` 查询视图及 activeId。用户明确目标优先，否则沿用当轮 task view 中发送时固定的 viewId；后续切换标签不改变本轮目标。读取布局和相机使用 `--view VIEW_ID`，相机写入不切换标签。Team/员工坐标全局共享。视图删除后报告错误，不退回 All Team；Governor 定时任务必须指定 action.viewId / --view。跨 Team 线经侧边/底边端口，箭头落在具体员工名牌，不能为了连线移动无关团队。

用户指定人物时，先用 `agents avatar list --query "人物名" --json` 查询真实目录；创建时明确传 character + avatarStyle 或 avatar ID。managementRole 是职级，profession 是职责，title 只是名字。创建后用 session status 读回 avatar/character/avatarStyle 核验。Manager 和 Governor 都遵守此流程，授权范围以实时身份为准。
