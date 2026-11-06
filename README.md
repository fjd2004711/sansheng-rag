# 三省：基于 LangChain 的可解释自纠错 RAG Agent 与多智能体编排平台

> **三省（Sansheng）**：起草、审核、执行，各司其职。名字取自唐代三省制——中书省起草诏令，门下省审核并可“封驳”（退回），尚书省执行；写的人不审，审的人不写。对应到系统里：规划师、撰稿人、分析师负责起草；独立核查员与质量门负责审核并打回；调度器、检索员、修复员、主编负责执行。界面顶部名字旁的“ⓘ”可以看到这段说明。

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

界面全部为中文。没有启动页：打开站点直接进入对话页，未登录时转到登录页。

- `/chat`：对话，右侧展示 Agent Trace（React Flow）与 Evidence Viewer；可切换“资料问答 / 联网调研 / 分析报告”
- `/rag`：知识库管理（上传、入库状态、检索验证），需要管理员账号
- `/reports`：调研报告（联网检索、逐条核验，导出 Word / PDF；底层走编排引擎）
- `/orchestration`：编排平台（运行画布、调度时间线、质量门与自循环、报告阅读、工作流定义与模型选择）
- `/evaluation`：回答质量与 P5 评测、消融看板
- `/login`、`/register`

第一个注册的用户自动成为管理员；公开部署前请先自行注册，或使用 `create-app-admin` 命令。

### 演示免登录（可选）

在 `frontend/.env.local` 里设置服务端变量 `DEMO_LOGIN_EMAIL` 和 `DEMO_LOGIN_PASSWORD`，打开站点时会自动以该账号进入对话页，不需要输入密码。**任何能访问该站点的人都会以这个账号进入**，请只在可信网络使用，并优先使用非管理员账号。不设置则保持正常登录。

### 模型

聊天与评审模型通过 OpenAI 兼容接口配置（`backend/.env` 的 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`AI_MODEL`）；嵌入模型单独配置（`EMBEDDING_*`）。对默认开启“思考模式”的服务（如阿里云百炼 Qwen3），需设置 `AI_DISABLE_THINKING=true`，否则 `tool_choice=required` 会被拒绝。密钥只放在被 git 忽略的 `.env`。

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
| [ARCHITECTURE.md](ARCHITECTURE.md) | 冻结架构与不可破坏的边界 |
| [ROADMAP.md](ROADMAP.md)、`docs/P*_ACCEPTANCE.md` | P0–P5 阶段门控 |
| [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md) | 编排平台的实现说明、实测与不足 |
| [docs/COMPETITION_PLAN.md](docs/COMPETITION_PLAN.md) | 竞赛方案的最初构思 |
| [docs/proposal/](docs/proposal/) | 初赛方案书（PDF，含系统截图） |
| [ENV_VARS.md](ENV_VARS.md) | 环境变量 |
| [UPSTREAM.md](UPSTREAM.md) | 底座模板来源 |

## 作者与许可

作者：[fjd2004711](https://github.com/fjd2004711)（唯一贡献者）。

本项目以 [MIT 许可证](LICENSE) 发布。工程底座基于 [full-stack-ai-agent-template](https://github.com/vstorm-co/full-stack-ai-agent-template)（MIT），详见 [UPSTREAM.md](UPSTREAM.md)。
