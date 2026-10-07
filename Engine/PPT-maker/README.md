# PPT-maker

Aexus 的独立演示制作 Engine。用户提供需求或 PPTX/POTX 模板，策划、设计与审校三个员工通过公开 Contract 协作；用户在引擎中预览、修改，最终下载一份原生可编辑的 `presentation.pptx`。

## 使用

在 Aexus 的 **Engine library** 选择 **PPT-maker**，点击 **Load PPT-maker**；已进入工作区时可切换到顶部 Engine 页。先在 Infra 配置一种可用 Coding Agent；本引擎不自动安装模型、不借用或签发凭据。单纯模板导入、手动修改和导出不调用模型。

1. 填写需求，或上传 PPTX/POTX 模板。可附 TXT、Markdown、CSV 原始资料。
2. 新建演示默认先给可编辑大纲；确认后，内容与设计并行，独立员工审校。
3. 左侧选页，中间画布拖动，右侧改文字/图表/表格/备注。自然语言修改只针对当前页。
4. 修复结构错误，检查审校和模板预览限制，再导出。下载区只有最终 PPTX，没有内部 JSON、日志或截图。
5. 已完成文稿使用“创建修订”生成新工作流，之前文件保持不变。

## 开发安装

从 Aexus 根目录执行（只在准备好的源码环境中，不自动重启正式应用）：

```sh
npm ci --prefix Engine/PPT-maker
npm run contract:check
npm run build
npm run dev
```

本引擎依赖单独声明在自己的 package.json / package-lock.json；不修改根依赖。安装版需要宿主的通用 Engine 打包流程同时包含这些依赖，单纯源码测试不能代表已安装应用已经更新。

## 能力与限制

| 能力 | 当前范围 |
| --- | --- |
| 新建演示 | 3–24页；16:9、4:3；4套主题，8种版式；编辑后最多40页 |
| 原生对象 | 文本、简单形状、用户图片、表格；柱/线/饼/环图含内嵌数据工作簿 |
| 模板 | 4MiB以内 .pptx/.potx，1–40页；保留原生部件，局部修改文字、数据、坐标、备注、顺序 |
| 模板保真边界 | 保持原页数和对象集合；不可新增/删除/复制模板页或对象；组合内位置及继承母版只读 |
| 预览 | Engine 自有 SVG 预览，无需把幻灯片栅格化；复杂母版、裁剪、渐变、SmartArt等可能简化，原文件对象保留 |
| 图表编辑 | 新建图表可编辑完整数据；导入图表仅修改受支持的现有数值；跨页共用同图表只读 |
| 原始资料 | 最多8份TXT/MD/CSV，单份8万字符，合计16万；不提供PDF/DOCX自动解析或自动联网研究 |
| 图片 | 手动上传每张2MiB以内；场景中的图片预览合计6MiB；不内置图片生成服务 |
| 工作流 | 确认大纲、保存、按页AI修订、独立审校、导出、取消、失败恢复、完成后新版本 |
| 模板文件安全 | 拒绝旧PPT、加密、宏、数字签名、非法ZIP路径、XML DTD、缺失内部关系及超过安全上限的包 |

“可编辑”指输出中的真实PowerPoint对象，不是每页一张截图。浏览器预览不承诺与所有版本的PowerPoint像素相同。原生Office/WPS的字体替代、复杂效果和图表样式仍须在目标软件检查。

## 架构

`Page.tsx / Editor.tsx / drafts.ts` 负责 UI；`workflow.mjs` 负责公开客户端修订准备；`model.mjs / runtime.mjs / agents.mjs` 负责领域流程；`scene.mjs` 是便携文稿、布局与预览模型；`render.mjs / ooxml.mjs` 生成原生对象、正规化生成包并审计部件/图表关系；`template.mjs / archive.mjs` 处理 OOXML 保真补丁与文件检查。

生产代码仅导入本 Engine、Contract 和自己的依赖，不导入 Infra 内部实现或其他 Engine，不读写 Core Store/数据库。领域状态通过 `ctx.checkpoint` 托管；员工和原生会话由 Infra 维护。最终文件通过 `workflow.file` 下载。

工作流运行时禁止递归工作流调用。因此修订由 UI/CLI 的 `prepareRevision` 先通过公开 API 读取授权父版本，再提交独立快照。`parentId` 是用户提交的来源标记；它不被用作跨工作流的授权凭据或不可伪造的审计证明。

## CLI 与程序接入

```sh
node Engine/PPT-maker/cli.mjs --help
node Engine/PPT-maker/cli.mjs start --input @brief.json --request-id my-deck-1
node Engine/PPT-maker/cli.mjs get --id WORKFLOW_ID
node Engine/PPT-maker/cli.mjs download --id COMPLETED_ID --output final.pptx
```

所有本地输出采用排他创建，拒绝覆盖已有文件。完整输入、阶段、交互与工具见 [docs/API.md](docs/API.md)。与 PPT-master 的实现范围对照见 [docs/PARITY.md](docs/PARITY.md)。

## 验证

```sh
cd Engine/PPT-maker
npm test
npm run test:contract
npm run test:ui
npm run test:infra
npm run test:host-ui
npm run test:host-desktop
npm run examples
```

单元/UI夹具验证逻辑和真实渲染；Infra黑盒验证使用临时源码副本、临时Core和真实Pi程序，模型上游是仅监听loopback的确定性服务。测试可能通过公开安装器把Pi安装到临时目录，也可使用 `PPT_MAKER_TEST_PI_BIN` 指定已安装程序；不操作正式App、正式用户数据或付费模型。

测试仅通过公开CLI/Contract与宿主通信，复制源码执行公开构建，不导入Infra实现；不覆盖根 `.aexus/out`。实际浏览器和隐藏Electron的结果分别记录。`test-artifacts/verification.json` 汇总最终状态。测试并不证明任意模型均能一轮生成满意演示，更不证明所有Office版本通过。

## 本次验收记录

`test-artifacts/verification.json` 记录本次交接源码hash、检查范围与限制。49项文档/工作流与生成包回归、Engine类型检查与Contract检查通过；Engine独立浏览器12项、真实公共Core10项、完整Web5项及隐藏Electron5项功能检查通过。真实Pi使用本机确定性模型，不调用付费服务、不操作正式数据。

两个8页PPTX经过独立LibreOffice实际渲染，共16页，并通过画布越界检查；模板局部修改保留47个未触及部件，图表缓存与内嵌工作簿同时更新。Microsoft PowerPoint/WPS各版本未逐个实机验证。

隐藏macOS窗口缩放后截图存在平台停滞：窄屏和模板两个桌面截图明确省略，继续执行真实DOM、交互与导出检查；对应视觉证据保存在完整Web测试中。不能把这些桌面截图列为通过。

本Engine没有替换或重启正式应用。另一个安装会话的已安装版本、正在开发的Engine资源作用域改动，均应以对应维护者的安装/集成报告为准。

## 生成包二次复核

已针对锁定的PptxGenJS 4.0.1增加独立 `ooxml.mjs`：移除生成包中不存在部件的ContentType声明、二维图表未定义轴引用及工作簿未使用的表格部件；普通数据单元格、共享字符串、样式保持不变。每次新建导出执行严格检查，检测错误即阻止交付。该处理不应用于用户模板，不静默修复或重写用户原件。检查范围不等于完整ECMA XML schema或所有Office版本实机验证。

新增7项回归验证修复、幂等、原始数据保留、缺失声明与轴错误拦截、四类图表和多序列回读，以及用户模板不经过正规化。已适配实际宿主的Engine library / Load PPT-maker导航，仅调整本Engine的黑盒测试；没有改共享Infra或其他Engine。
