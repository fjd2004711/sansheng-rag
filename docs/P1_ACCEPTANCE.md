# P1 验收规则：Hybrid Retrieval

P1 在 P0 Frozen Commit `17ba040` 之上实现独立 Dense 与 BM25 全量召回、RRF 融合和 Reranker。

## 不变量

1. BM25 的候选来自 collection 全部 chunk，禁止先取 Dense 候选再计算 BM25。
2. Dense、BM25、RRF、Reranker 分数都必须随结果保留。
3. 新增、替换和删除文档后，BM25 缓存必须失效。
4. 评测使用固定黄金集，Baseline 和 Hybrid 使用同一个 collection、问题与 top-K。
5. Hybrid 至少有一项检索指标相对 Baseline 提升，且其余核心指标不能下降。

## 门控

| 检查 | PASS 条件 |
| --- | --- |
| 全量稀疏召回 | 单元测试证明 BM25 可找回 Dense 未给出的 lexical hit。 |
| RRF | 单元测试确认同一 chunk 的 Dense / BM25 / RRF 分数可回查。 |
| Reranker | 实机调用并产出 `reranker_score`。 |
| 检索评测 | 输出 Dense 与 Hybrid 的 Recall@5/@10、MRR、nDCG。 |
| 价值证明 | Hybrid 的对比报告满足上面的提升约束。 |
| 回归 | P0 live gate、stream gate 与自动测试继续 PASS。 |

P1 未通过前，不引入 P2 的 Evidence Judge、Query Rewrite、Failure Diagnosis 或任何循环控制。
