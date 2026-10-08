# P4 验收规则：Explainable Agent UI

P4 将 P2 与 P3 的真实控制状态呈现为项目成果，而不是静态演示素材。

## 三栏工作台

- 左栏：现有会话与知识库导航。
- 中栏：聊天、已校验答案与可点击引用。
- 右栏：React Flow 渲染的 Agent Process，展示检索、证据判断、失败诊断、Query Rewrite、重检索、生成与回答校验。

## Trace 与 Evidence

- P2 Trace 通过 WebSocket `agent_trace` 事件传入前端；P3 Trace 使用同一事件协议。
- 过程节点展示轮次、PASS/FAIL 状态、失败原因、查询改写与校验分数。
- 引用打开 Evidence Viewer，显示文件、页码、Chunk、总分及 Dense、BM25、RRF、Reranker 分量分数。
- 用户只看到 P3 校验后的最终回答；未经验证草稿不进入文本流。

## 门控

- 前端 TypeScript 检查、Lint 与生产构建通过。
- P0 WebSocket 门控必须收到 P2/P3 Trace，同时工具结果对用户不泄漏内部 trace 封装。
- P0/P1/P2/P3 自动测试与真实门控继续通过。
