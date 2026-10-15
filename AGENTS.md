# Aexus 项目原则

保持简单，优先核心功能正确、高内聚、低耦合和最小修改。复用现有接口，不为假想边界增加抽象或配置。修改前先理解代码；不猜测 API 或业务语义。

Agent Board 只管理原生 Coding Agent，会话与角色身份分离；Role Board 管理 Company、Messages、Plan。保留原生配置与历史，不向 Agent Board 的模型上下文注入协作或路由提示词。主机管理与 VM Lab 独立。

Aexus 不再附带旧版的 Mini Notion、Margin Reader、Cloud Hosts 插件产品。原生用户数据继续使用兼容目录，禁止通过改名迁移误删主机、凭据、文件或聊天历史。

测试用隔离数据；用户明确停止测试时不再启动功能测试。部署前完成构建，检查活动任务，退出旧应用后再替换包。保留用户工作，只有明确授权时才删除旧项目、历史包或推送远端。

GitHub 主仓库为 Daijunfan/Aexus。Marketing/Reference 保存用户要求保留的宣传参考素材；不能删掉，也不能把旧海报当作当前功能承诺。
