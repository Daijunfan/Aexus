## 开始工作

这是由根 API、调度规范和注册表生成的全局参考手册，不是权限凭据。员工执行 `agents auth whoami --json`、`agents management roles --json`、`agents api docs` 读取自己的实际身份与能力。

Governor / Manager / Employee 是员工自身的职位。Manager 管理本 Team 全部 Employee；Governor 跨 Team 管理团队与员工，并可调整其他 Governor 的位置。Governor 的创建、删除、晋升、降级仅限用户；禁止借整个 Team 删除或克隆绕过。

管理职位必须在 Core 所在主机本地运行与工作，所属 Team 可任意。在 Cloud Team 创建管理职位需 `--work-environment local`。不需要绑定 Agents-Managers 文件夹，加入旧管理 Team 不会继承权限。

公司员工通过 `agents card create` 登记。普通 Employee 直接就绪；Manager / Governor 有隐藏初始化，待 ready 后再派发任务。使用真实员工 ID 调用 `session.*` / `schedule.*`；引擎内置子 Agent 不替代公司员工。

Team 与员工可改显示名，既有目录与归属保持固定。所有公司管理操作走 CLI，不直接修改宿主 JSON。返回发送成功只表示请求已接受，完成状态需继续查询。

按操作系统建队先使用 `host list --summary --json`，按 os / distribution 选择已登记主机。云端使用 `group add NAME --mode cloud --host-id ID --directory-mode default`；Team/View 名称不代表操作系统。用 topology 的团队绑定和员工 workspace 字段核验；Cloud Team 中 Manager 用 local，招的 Employee 继承 team。完整步骤见下文“Governor: four actual operating-system teams”。
