# P0 验收门控

P0 只有在所有必选项 PASS 后才能提交冻结。

| 门控项 | 可证伪检查 | 当前状态 |
|---|---|---|
| 文档上传 | PDF、DOCX、MD、TXT 各上传一个有效样本；非法格式返回明确错误 | PENDING |
| 文档解析 | 文本非空，保留文件名、页码或段落位置 | PENDING |
| 索引构建 | Qdrant collection 存在，chunk 数与上传结果一致 | PENDING |
| 检索 | 固定问题的 Top-K 包含预期 chunk | PENDING |
| 回答 | 回答只使用检索上下文，知识库无答案时明确拒答 | PENDING |
| 引用 | 每条 source 可反查文件和 chunk；PDF 引用包含页码 | PENDING |
| 流式输出 | WebSocket 至少产生增量文本和完成事件 | PENDING |
| 基础前端 | 登录、知识库、上传、聊天和来源展示可操作 | PENDING |
| 自动测试 | 后端测试、前端类型检查和构建全部通过 | PENDING |

## PASS 证据

验收脚本必须生成 `artifacts/p0-gate-report.json`，记录时间、upstream commit、项目 commit、每个门控的结果和关键观测值。截图或人工观察只能作为补充，不能代替自动检查。

## 明确排除

以下内容不计入 P0，也不能用来补救 P0 失败：BM25、RRF、Reranker、LangGraph 纠错图、Evidence Judge、Query Rewrite、Answer Judge、React Flow Trace、ECharts 评估面板。

