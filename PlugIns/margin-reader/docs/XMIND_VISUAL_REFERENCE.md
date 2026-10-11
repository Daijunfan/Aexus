# XMind 官方原生视觉参照与实现

此文保留最初16张参照及12种初始骨架的开发记录；当前0.8.0扩展到54种独立骨架，现行实现与使用方式见 [MINDMAP_COMPLETION.md](MINDMAP_COMPLETION.md)。原始观察和图片出处未更改。

检索与逐图审阅日期：2026-10-02。参考了16张官方原生结构图、界面截图和功能图；前10张来自官方旧版功能页，其余来自官方当前结构说明。它们用于分析，未复制进运行包。

原图、来源页面、文件长度和 SHA-256 保存在本轮 ignored artifacts/references/sources.json；下表可直接访问官方原图。

| 编号 | 参照 | 观察重点 | 对应实现 |
|---|---|---|---|
| 01 | [思维导图](https://assets.xmind.net/www/assets/images/features-2022/structure-mind-map-5bfb714bfd.png) · [官方页面](https://xmind.app/mindmapping/) | 中心、一级色块、下级文字；层级形状和线宽有区别 | classic、rounded、capsule |
| 02 | [逻辑图](https://assets.xmind.net/www/assets/images/features-2022/structure-logic-chart-8bffe4a263.png) · [官方页面](https://xmind.app/mindmapping/) | 单向展开、紧凑文本、同层对齐 | logical、logic-left/right |
| 03 | [括号图](https://assets.xmind.net/www/assets/images/features-2022/structure-brace-map-a5358873a9.png) · [官方页面](https://xmind.app/mindmapping/) | 真正的分组括号，简洁文字和短连接 | brace |
| 04 | [组织图](https://assets.xmind.net/www/assets/images/features-2022/structure-org-chart-0834e09ef9.png) · [官方页面](https://xmind.app/mindmapping/) | 共享横向分支、上下级、可混合局部结构 | organization、org-up/down |
| 05 | [鱼骨图](https://assets.xmind.net/www/assets/images/features-2022/structure-fishbone-2ae647925b.png) · [官方页面](https://xmind.app/mindmapping/) | 单一主轴、成对斜骨、细分原因接在斜骨上 | fishbone-left/right |
| 06 | [时间轴](https://assets.xmind.net/www/assets/images/features-2022/structure-timeline-5823a8bbc3.png) · [官方页面](https://xmind.app/mindmapping/) | 事件主题位于轴线上，补充内容位于两侧 | timeline-horizontal/vertical |
| 07 | [树状图](https://assets.xmind.net/www/assets/images/features-2022/structure-tree-chart-dd2c2398aa.png) · [官方页面](https://xmind.app/mindmapping/) | 主干与分层支线，主体层级清晰 | tree-left/right |
| 08 | [树形表格](https://assets.xmind.net/www/assets/images/features-2022/structure-tree-table-80285b74ef.png) · [官方页面](https://xmind.app/mindmapping/) | 父单元格跨行／跨列，边界对齐 | tree-table-right/down |
| 09 | [矩阵](https://assets.xmind.net/www/assets/images/features-2022/structure-matrix-c89f68e118.png) · [官方页面](https://xmind.app/mindmapping/) | 真正的标题行、列和对齐的内容单元格 | matrix |
| 10 | [原生编辑器](https://assets.xmind.net/www/assets/images/features-2022/outliner-1-fededb75f2.png) · [官方页面](https://xmind.app/mindmapping/) | 彩色主分支、文字叶节点、紧凑布局 | 默认classic和分级字体 |
| 11 | [混合结构](https://framerusercontent.com/images/HjCaAhNNsY4zfwhxIz3W2IIo.png) · [官方页面](https://xmind.com/user-guide/structure-new) | 不同分支采用不同结构，连线不能穿过其它主题 | 局部结构+外围路由 |
| 12 | [骨架选择器](https://framerusercontent.com/images/eD8uV8e4w5jGi1OSCEXcu9R80.png) · [官方页面](https://xmind.com/structure) | 缩略图应显示真实拓扑与主题形状 | 12种真实共享布局缩略图 |
| 13 | [配色选择器](https://framerusercontent.com/images/qUmDY4MbLWj81zkNFtE3n1648Mk.png) · [官方页面](https://xmind.com/structure) | 颜色与骨架独立，换色不改已选骨架 | 13套配色+独立skeleton |
| 14 | [概要](https://framerusercontent.com/images/YHmAjAOaXWuU93DpZCxhrXk94Lk.png) · [官方页面](https://xmind.com/structure) | 括号锚定一组选中主题，可继续编辑总结 | 既有summary保留 |
| 15 | [外框](https://framerusercontent.com/images/QEIBhAdk4LhFA0IScJLtVCLru6U.png) · [官方页面](https://xmind.com/structure) | 围住真正的主题范围，具有独立标题 | 既有boundary保留 |
| 16 | [关系](https://framerusercontent.com/images/7UCtNs5Dzbqugoq6jurrrU76o.png) · [官方页面](https://xmind.com/structure) | 关系线、标签和箭头独立于父子关系 | 既有relationship保留 |

## 结构与操作

脑图工具栏的“骨架 / 配色”打开12种布局骨架的实际缩略图。骨架同时设置结构和层级样式；更换配色保持选定骨架。15个方向结构选项覆盖思维导图、左右逻辑、上下组织、左右树状、横纵时间轴、左右鱼骨、矩阵、括号及横纵树形表格。方向变体不声称是15个不同结构家族。

默认显示：中心与主分支色块，下级为紧凑文字和下划线；完整标题换行，默认不显示大截图。保留原位标题编辑、详情预览、单击PDF回源、元数据、标记、手写、可恢复删除及旧资料卡片视图。

拖动使用原画布中的主题元素，保留当前缩放，禁用原生HTML拖拽图像。主题中心区域接纳子主题，边缘显示同级插入位置；跨中心调整主分支左右位置；Option/Alt拖到空白处建立自由主题。Shift多选的完整分支一起移动。Escape取消不写数据，冲突不会自动重试。Option/Alt加上下方向键可调整同级顺序。

“整理成导图”显式创建一个中心主题并连接原有自由分支，原有子树、ID、摘录和链接保留，可以一次撤销。该动作不会在打开文库时自动执行。

## 验证方法

`tests/xmind-reference.test.cjs` 使用125个主题、六层结构检查所有结构的完整性、相交、轴线、实际结构路径与版本事务；`tests/xmind-structures-ui.cjs` 在实际浏览器中逐个应用12种骨架，检查53个主题的屏幕矩形、文字边界、连线穿过其它主题和错误线宽，并输出实际截图。

`tests/xmind-drag-ui.cjs` 用真实指针动作在40%、90%、160%缩放下检查拖动中的宽高、位移、子树成员和原生dragstart计数，再验证移动、排序、跨侧、脱离、取消、并发拒绝及撤销。`tests/xmind-native-ui.cjs` 在独立隐藏原生窗口中验证同样的拖拽几何及复杂骨架持久化。

命令：`npm run test:xmind`、`npm run test:deep-audit`、`npm run test:agent-acceptance`。实际通过结果以本轮日志和验收JSON为准，本说明不代替运行结果。

## 未宣称完成

本轮不是商业XMind全功能兼容认证。未复制其54套商业骨架、私有素材、云协作或AI能力；未把方向选项或颜色组合计为新增结构。尚未在商业客户端逐版本验证所有XMind私有扩展。Windows/Linux、实体数位笔、多小时重图片压力仍需各自实测。
