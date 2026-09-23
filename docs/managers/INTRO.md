## 开始工作

本文件由项目根目录的 `API.md`、`SCHEDULER.md` 和共享 CLI 注册表汇总生成。它是未来 Manager Team 员工的操作手册。**业务更改一律通过 CLI；不要直接编辑保存的 Team、员工或排期 JSON。**

1. Manager Team 应使用本地 **Build** 模式，并将 Team 根目录绑定到项目的 `Agents-Managers` 文件夹。每位员工默认使用其中与自己同名的子文件夹；手动绑定也必须留在该根目录内。cloud 员工在远端执行，不能连接 Mac 上的本地服务。
2. 每位员工 Workspace 都有独立复制的手册和 `.agents-company/bin/agents` 启动器。员工进程的 PATH 自动包含这个 bin 目录，可以直接执行 `agents`；终端 PATH 被重置时执行 `./.agents-company/bin/agents`。Team 根目录只用来容纳员工文件夹，不存放手册。
3. 桌面 App 或 `agents serve` 必须有一个正在运行。先执行 `agents status --json`；再执行 `agents session list --json` 获取**稳定员工 ID**，`agents session list --live --json` 获取**当前会话 ID**。会话关闭后 live ID 会改变，员工 ID 不变。通过 `agents group list --details --json` 查看 Team 根目录与模式。
4. 每个命令可追加 `--json`。成功返回 `{ "ok": true, "data": ... }`；失败返回 `{ "ok": false, "error": "..." }`，CLI 非零退出。读取上一条命令的结果与 ID，再执行依赖它的操作。

文档源位于项目的 `docs/managers`，不会自动创建 Team。如果要绑定 Manager 根目录，从项目根目录执行：

```sh
./bin/agents group add Managers --mode build --directory-mode bind --root /Users/djf/develop/CS/Agents-company/Agents-Managers --json
./bin/agents card create --title Director --group Managers --engine codex --directory-mode default --json
```

Team 和员工名称创建后不可更改。要修改其他员工或 Team，先读其稳定 ID、工作目录与忙碌状态；调用下文的 `card update`、`config ...`、`group configure`、`room design`、`room bounds` 等命令。删除 Team 会连带删除员工和会话，工作文件保留。Manager 权限来自运行中的本地宿主 CLI，不需要直接修改数据库。

一个常见流程：

```sh
agents status --json
agents group list --details --json
agents session list --json
agents group add Engineering --mode build --directory-mode default --json
agents card create --title Reviewer --group Engineering --engine codex --model gpt-5.6-luna --effort low --json
agents card update EMPLOYEE_ID --role 'Code reviewer' --color '#7089c4' --json
agents session open EMPLOYEE_ID --json
agents config model SESSION_ID gpt-5.6-luna --json
agents session send SESSION_ID 'Review the repository and report concrete issues.' --json
agents session follow SESSION_ID --json
```

插件领域命令先执行 `agents plugin list --json`、`agents plugin describe ID --json` 读取该插件独立的 Markdown/API schema，再用 `agents plugin call ID METHOD --team NAME --params @request.json`。Team 必须按插件契约授权。`ui.*` 只用于已有窗口的外观验收；Manager 在 `agents serve` 下仍可完成所有业务操作。目录选择器、屏幕截图等视觉行为需要窗口，CLI 管理文件夹时直接传入物理路径即可。

定时任务保存并执行在宿主 Core 中。先读 `agents schedule schema --json`，创建后用 `schedule preview` 检查触发时间，再 `schedule status` 和 `schedule history` 确认执行结果；使用 `schedule run` 会立刻启动模型工作，不用于试探排期。下面附有完整的定时契约。
