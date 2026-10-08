# P0 验收规则：Project Foundation + Baseline RAG

P0 只允许单路 Dense RAG。不得启用 BM25、RRF、Reranker、Retriever Grader、Query Rewrite、LangGraph 纠错循环、React Flow Trace 或 ECharts 评估面板。

## 必须通过的门控

| 检查 | 判定方式 |
| --- | --- |
| 文档上传 | 实际上传 TXT、Markdown、DOCX、PDF；接口返回已受理记录。 |
| 文档解析 | 每个文件状态为 `done`，且 chunk 数大于 0。 |
| 索引构建 | 文档已在 Qdrant collection 中可检索。 |
| Dense 检索 | 已知问题返回预期证据；结果含 parent document id。 |
| 来源追踪 | 每个结果含 filename、page/chunk 元数据；原文件可下载且字节一致。 |
| 回答和引用 | Agent 以 `search_documents` 取证后给出带 `[n]` 的回答。 |
| 流式输出 | WebSocket 发出 `tool_call`、`tool_result`、`text_delta` 和 `complete`。 |
| 基础前端 | Next.js production build 通过；服务在 3010 返回 HTTP 200。 |
| 自动测试 | 后端测试套件全绿；跳过项必须在报告中列明。 |
| 阶段边界 | 配置确认 `RAG_HYBRID_SEARCH=false`，且运行路径没有启用 P1+ 能力。 |

## 可复现门控命令

在服务器项目根目录执行：

```bash
./scripts/run_p0_live_gate.sh
./scripts/run_p0_stream_gate.sh
```

两个脚本分别生成 `artifacts/p0-live-gate.json` 与 `artifacts/p0-stream-gate.json`。任何一项失败都必须保持在 P0，修复、复测、审计后才能提交冻结。
