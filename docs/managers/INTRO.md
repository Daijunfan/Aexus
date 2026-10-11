## 开始工作

这是由根 API、调度规范和注册表生成的全局参考手册，不是权限凭据。所有角色初始化只读取真实身份和 `agents api docs` 的共享短索引；之后按需用 `agents api describe COMMAND --all --json` 或 `agents api docs DOCUMENT` 阅读，不把整册手册自动载入上下文。Core 的 Company、Messages、Plan 三视图与 MiniNotion 等独立插件分列，执行权限仍由 Core 检查。

Governor / Manager / Employee 是员工自身的职位。Manager 管理本 Team 全部 Employee；Governor 跨 Team 管理团队与员工，并可调整其他 Governor 的位置。Governor 的任免由用户或 Secretary 操作；Governor 自己不能借整个 Team 删除或克隆绕过。

Manager/Governor 的职位与执行位置独立，可在 Cloud Team 使用 `workEnvironment:team` 或明确选择 `local`。已支持的原生云端引擎也允许这两个职位；Secretary 保留 Core 本地要求。加入旧管理 Team 或工作目录不会继承权限。

公司员工通过 `agents card create` 登记。Employee / Manager / Governor 都完成简短隐藏初始化，待 ready 后再派发任务；不执行文档示例或预加载全部 API。使用真实员工 ID 调用 `session.*` / `schedule.*`；引擎内置子 Agent 不替代公司员工。

Team 与员工可改显示名，既有目录与归属保持固定。所有公司管理操作走 CLI，不直接修改宿主 JSON。返回发送成功只表示请求已接受，完成状态需继续查询。

按操作系统建队先使用 `host list --summary --json`，按 os / distribution 选择已登记主机。云端使用 `group add NAME --mode cloud --host-id ID --directory-mode default`；Team/View 名称不代表操作系统。用 topology 的团队绑定和员工 workspace 字段核验；Cloud Team 中 Manager/Governor 可以明确选择 team 云端或 local 本地环境，不隐式切换；下属仍使用各自固定工作环境。完整步骤见下文“Governor: four actual operating-system teams”。
