# 基于 LangChain 的可解释自纠错 RAG Agent

回答可追溯到 `claim -> evidence -> source`；检索或生成失败时，先诊断失败类型，再选择重检索、Query Rewrite、问题拆解、重生成或拒答，且所有纠错循环都有最大轮数限制。

## 技术栈

| 层 | 技术 |
|---|---|
| Agent | LangChain（主框架）；LangGraph 只负责状态、条件路由和有界纠错循环 |
| 检索 | Dense + BM25（各自全量召回）→ RRF → Reranker |
| 后端 | FastAPI、PostgreSQL、Qdrant、WebSocket 流式输出 |
| 前端 | Next.js 15、React 19、Tailwind、React Flow（Trace）、ECharts（评测） |
| 文档 | PDF、DOCX、Markdown、TXT |

## 产品界面

- `/`：公开展示页（固定样例 + 评测脚本生成的指标）
- `/chat`：对话，右侧展示 Agent Trace（React Flow）与 Evidence Viewer
- `/rag`：知识库管理（上传、入库状态、检索验证），需要管理员账号
- `/evaluation`：P5 评测与消融看板
- `/login`、`/register`

第一个注册的用户自动成为管理员；公开部署前请先自行注册，或使用 `create-app-admin` 命令。

## 快速开始

```bash
# 依赖服务
docker compose up -d                                   # PostgreSQL、Qdrant、后端
docker compose -f docker-compose.frontend.yml up -d --build

# 本机开发进程
cd backend
cp .env.example .env                                   # 填写模型地址等，见 ENV_VARS.md
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8010 --ws websockets-sansio

cd ../frontend
npm install
npm run dev                                            # http://localhost:3010
```

后端运行在宿主机时 PostgreSQL 为 `localhost:55432`；运行在 Compose 内时为 `db:5432`。

## 验证

```bash
cd backend && uv run pytest -q
cd frontend && npm run type-check && npm run lint && npm run build
```

阶段门控与评测脚本：`scripts/run_p*_gate.*`、`eval/p1/run_retrieval_eval.py`、`eval/run_p5_evaluation.py`，报告写入 `artifacts/`。指标必须由脚本生成。

## 文档

| 文件 | 内容 |
|---|---|
| [HANDOFF_FOR_CLAUDE.md](HANDOFF_FOR_CLAUDE.md) | 当前真实状态、已知问题、下一步 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 冻结架构与不可破坏的边界 |
| [ROADMAP.md](ROADMAP.md)、`docs/P*_ACCEPTANCE.md` | P0–P5 阶段门控 |
| [ENV_VARS.md](ENV_VARS.md) | 环境变量 |
| [UPSTREAM.md](UPSTREAM.md) | 底座模板来源 |
