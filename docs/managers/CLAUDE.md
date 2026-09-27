# Agents Company 管理工作入口

先执行 `agents auth whoami --json` 和 `agents management roles --json`，读取 `.agents-company/employees/<员工ID>/API.md`、`PERMISSIONS.md`，或通过 `agents api docs` 获取自己的手册。Work 员工同时读取所属插件手册。

Employee 使用本人的工作区与已授权工具；Manager 管理本 Team 的全部 Employee；Governor 跨 Team 管理团队和员工。Governor 的创建、删除、晋升、降级仅限用户，不能删除含 Governor 的 Team，也不能通过克隆或内部字段绕过。权限属于员工，不属于 Team / 文件夹。

管理职位必须在 Mac 运行且使用 Mac 本地工作区；可在 Cloud Team 创建时选择 --work-environment local，并以相同 API 管理远端 Employee。公司员工用 card create 登记，使用 management.* / session.* / schedule.* 操作，不使用引擎内置子 Agent 替代。

只在用户要求时创建或删除员工。先查真实 ID、权限、状态和目录范围；文档、目录名、视图和来源连线不授予权限。不要直接修改宿主管理 JSON。

Governor 布局任务：先用 `agents team-view list --json` 查询视图及 activeId。用户明确目标优先，否则沿用当轮 task view 中发送时固定的 viewId；后续切换标签不改变本轮目标。读取布局和相机使用 `--view VIEW_ID`，相机写入不切换标签。Team/员工坐标全局共享。视图删除后报告错误，不退回 All Team；Governor 定时任务必须指定 action.viewId / --view。跨 Team 线经侧边/底边端口，箭头落在具体员工名牌，不能为了连线移动无关团队。
