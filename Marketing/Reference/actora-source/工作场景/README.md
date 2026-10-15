# 保留的宣传场景

正常打开 Agents Company，点击顶部的 **宣传场景** 视图。

这 5 个 Team、20 名员工已经通过正式 CLI 创建并保留在日常 App 中。可以继续改名字、拖动 Team / 员工、选择连线端点。与其他视图相同，员工和 Team 的坐标是共享的；在这里修改，也会反映到 All Team。

- 决策中枢：1 位 Governor。
- Web 研发部：1 位 Manager，3 位 Employee。
- 产品体验部：1 位 Manager，4 位 Employee。
- 研究实验室：1 位 Manager，5 位 Employee。
- 内容创作部：1 位 Manager，3 位 Employee。

Ubuntu 与 Windows 使用现有登记的可用云主机；原生云端员工在 Ubuntu。Manager / Governor 均在 Mac 本地工作。Kali 原连接的私钥路径已丢失，因此本次研究组使用 Ubuntu。

员工不是静态图片；工作目录、引擎配置、创建来源和头像都已保存。海报里的“正在工作”状态由独立拍摄副本中的示例任务呈现，不会给这些保留员工派发真实业务任务，也不在主 App 中伪造忙闲状态。

需要重新拍图时，先打开主 App，然后在项目根目录运行：

```sh
node 宣传素材_小红书_2026-09-26/_制作脚本/capture-hierarchy.mjs
node 宣传素材_小红书_2026-09-26/_制作脚本/render.mjs --post 01
python3 宣传素材_小红书_2026-09-26/_制作脚本/package.py
```

拍摄脚本读取当前宣传团队的布局与端点配置，再在隔离副本中截图；不删除或重置主 App 的团队、员工和手工调整。`create-persistent-scene.mjs` 是首次搭建脚本，微调后不要用它重排场景。

员工和视图的稳定 ID 见 `场景清单.json`。逐条线路验证及高亮验收图见上一级 `逐线验收` 文件夹。
