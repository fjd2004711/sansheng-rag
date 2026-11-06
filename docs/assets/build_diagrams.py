"""Generate README diagrams (paper / ink / vermilion). Run: python3 docs/assets/build_diagrams.py"""
from pathlib import Path

OUT = Path(__file__).parent
PAPER, INK, SEAL, MUTE, LINE, SLIP = "#F3EEE3", "#2B2620", "#A83A2C", "#7A7064", "#BDB4A3", "#FAF6EC"
FONT = "Songti SC, STSong, Noto Serif CJK SC, SimSun, serif"


def head(w: int, h: int) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}">',
        f'<rect width="{w}" height="{h}" fill="{PAPER}"/>',
        f'<rect x="8" y="8" width="{w-16}" height="{h-16}" fill="none" stroke="{INK}" stroke-width="2"/>',
        f'<rect x="14" y="14" width="{w-28}" height="{h-28}" fill="none" stroke="{INK}" stroke-width="0.6"/>',
        '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
        f'<path d="M0 0 L10 5 L0 10 z" fill="{INK}"/></marker>'
        '<marker id="r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
        f'<path d="M0 0 L10 5 L0 10 z" fill="{SEAL}"/></marker></defs>',
    ]


def t(x, y, s, size=14, fill=INK, anchor="middle", weight="normal") -> str:
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>'


def box(x, y, w, h, title, sub="", stroke=INK, fill=SLIP, tsize=15) -> list[str]:
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>',
         f'<rect x="{x+3}" y="{y+3}" width="{w-6}" height="{h-6}" fill="none" stroke="{stroke}" stroke-width="0.5"/>']
    if sub:
        o += [t(x + w / 2, y + h / 2 - 3, title, tsize, weight="bold"), t(x + w / 2, y + h / 2 + 15, sub, 11.5, MUTE)]
    else:
        o += [t(x + w / 2, y + h / 2 + 5, title, tsize, weight="bold")]
    return o


def arrow(x1, y1, x2, y2, seal=False, dash=False) -> str:
    c, m = (SEAL, "r") if seal else (INK, "a")
    d = ' stroke-dasharray="5 4"' if dash else ""
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="1.4"{d} marker-end="url(#{m})"/>'


def title(w, s, sub):
    return [t(w / 2, 48, s, 22, weight="bold"), t(w / 2, 70, sub, 12.5, MUTE),
            f'<rect x="{w/2-30}" y="78" width="60" height="2" fill="{SEAL}"/>']


# ---------------------------------------------------------------- 1. layered architecture
def architecture() -> None:
    W, H = 920, 700
    s = head(W, H) + title(W, "系统总体架构", "前端只读事件；后端分层，调度层与业务无关")
    # left: web client
    s += box(40, 100, 840, 70, "前端　Next.js 15 · React 19 · Tailwind", "对话与证据　·　Agent Trace（React Flow）　·　编排画布与调度时间线　·　评测看板（ECharts）　·　报告阅读与导出")
    s.append(arrow(460, 170, 460, 196))
    s.append(t(560, 189, "REST / WebSocket（结构化事件）", 11, MUTE, "start"))
    layers = [
        ("定义层　spec.py", "YAML → Pydantic 校验 → PostgreSQL　·　知识库 / Agent 团队 / 工作流 / 策略（预算、质量门、轮次、并发）"),
        ("编排层　engine.py", "节点编译为调度组：agent · map（按数据扇出） · gate（质量门） · loop（有界修复） · merge"),
        ("调度层　scheduler.py", "asyncio 调度器　·　就绪集与优先级　·　搜索 / 模型资源池　·　重试、超时、预算　·　运行中插入任务"),
        ("执行层　skills.py", "规划　·　联网检索　·　分章撰写与数据核对　·　独立核查　·　修复　·　综合研判　·　统稿"),
        ("验证与反馈层", "数据点逐字核对　·　说法分级　·　逐条独立复核　·　质量门与失败诊断 → 修复路由"),
        ("可观测层　orch_events", "一切状态由事件日志推导：画布着色、调度时间线、质量门面板、事件日志，可完整回放"),
    ]
    y = 200
    for i, (a, b) in enumerate(layers):
        s += box(40, y, 840, 54, a, b, tsize=14)
        y += 62
    # infra row
    y += 4
    infra = [("LangChain", "模型与文档接口"), ("LangGraph", "问答纠错状态图"), ("PostgreSQL", "运行 · 事件 · 定义"),
             ("Qdrant", "稠密向量 · 临时集合"), ("BM25 + RRF", "独立稀疏召回与融合"), ("Reranker", "交叉编码重排")]
    w = 132
    for i, (a, b) in enumerate(infra):
        x = 40 + i * (w + 9.6)
        s += box(x, y, w, 56, a, b, stroke=SEAL, tsize=14)
    s.append(t(W / 2, y + 84, "基础设施与检索链（Dense + BM25 → RRF → Reranker）", 11.5, SEAL))
    s.append("</svg>")
    (OUT / "architecture.svg").write_text("\n".join(s), encoding="utf-8")


# ---------------------------------------------------------------- 2. self-correcting QA loop
def correction() -> None:
    W, H = 920, 560
    s = head(W, H) + title(W, "可解释自纠错回答流程", "先诊断失败类型，再选择纠错动作；每条回路都有最大轮数")
    s += box(40, 110, 120, 54, "用户问题")
    s += box(200, 110, 160, 54, "混合检索", "Dense + BM25 → RRF → 重排")
    s += box(400, 110, 150, 54, "证据评审", "相关性 · 充分性")
    s += box(590, 110, 130, 54, "生成回答", "claim → evidence")
    s += box(760, 110, 120, 54, "回答验证", "逐条 claim 核对")
    for a, b in [(160, 200), (360, 400), (550, 590), (720, 760)]:
        s.append(arrow(a, 137, b, 137))
    # diagnosis
    s += box(330, 250, 260, 60, "失败诊断", "判定失败类型，再选纠错动作", stroke=SEAL)
    s.append(arrow(475, 164, 475, 250, seal=True))
    s.append(t(487, 215, "证据不足 / 不相关", 11, SEAL, "start"))
    s.append(arrow(820, 164, 820, 280, seal=True))
    s.append(f'<path d="M820 280 L590 280" stroke="{SEAL}" stroke-width="1.4" fill="none" marker-end="url(#r)"/>')
    s.append(t(832, 215, "幻觉 / 不完整", 11, SEAL, "start"))
    actions = [
        (40, "重检索", "扩大 Top-K / 换策略"),
        (205, "Query 改写", "补全指代与关键词"),
        (370, "问题拆解", "子问题分别检索"),
        (535, "重生成", "带上被打回的原因"),
        (700, "拒答", "知识库没有答案"),
    ]
    for x, a, b in actions:
        s += box(x, 400, 150, 56, a, b)
        s.append(arrow(460, 310, x + 75, 400, seal=True))
    # loop-back
    s.append(f'<path d="M115 400 V200 H280 V164" stroke="{INK}" stroke-width="1.2" fill="none" stroke-dasharray="5 4" marker-end="url(#a)"/>')
    s.append(f'<path d="M690 400 V164" stroke="{INK}" stroke-width="1.2" fill="none" stroke-dasharray="5 4" marker-end="url(#a)"/>')
    s.append(t(125, 330, "回到检索", 11.5, MUTE, "start"))
    s.append(t(125, 346, "（最多 N 轮）", 11.5, MUTE, "start"))
    s.append(t(698, 190, "回到生成与验证", 11.5, MUTE, "start"))
    s.append(t(698, 206, "（最多 M 轮）", 11.5, MUTE, "start"))
    s.append(t(W / 2, 540, "达到最大轮数仍不过关 → 拒答并说明原因；全过程以结构化事件记录，供界面逐步回放", 12, SEAL))
    s.append("</svg>")
    (OUT / "correction-loop.svg").write_text("\n".join(s), encoding="utf-8")


# ---------------------------------------------------------------- 3. three provinces
def provinces() -> None:
    W, H = 920, 470
    s = head(W, H) + title(W, "三省分立：写的人不审，审的人不写", "取自唐代三省制，对应系统里的角色分工")
    cols = [
        ("起草", "中书省", ["规划师：提纲与检索词", "撰稿人：分章取证与写作", "分析师：综合研判与建议"], INK),
        ("审核", "门下省", ["独立核查员：只看草稿与证据", "质量门：四项指标，可“封驳”打回", "不读写作者的推理过程"], SEAL),
        ("执行", "尚书省", ["调度器：依赖、资源池、预算", "检索员：联网检索写入临时集合", "修复员 · 主编：补检索与统稿"], INK),
    ]
    for i, (a, b, items, c) in enumerate(cols):
        x = 40 + i * 285
        s += [f'<rect x="{x}" y="105" width="270" height="270" fill="{SLIP}" stroke="{c}" stroke-width="1.4"/>',
              f'<rect x="{x+4}" y="109" width="262" height="262" fill="none" stroke="{c}" stroke-width="0.5"/>',
              f'<rect x="{x+110}" y="122" width="50" height="50" fill="{c}"/>',
              t(x + 135, 157, a, 24, PAPER, weight="bold"), t(x + 135, 195, b, 13, MUTE)]
        for j, it in enumerate(items):
            s.append(t(x + 18, 235 + j * 40, "· " + it, 13.5, INK, "start"))
    s.append(arrow(310, 240, 325, 240))
    s.append(arrow(595, 240, 610, 240))
    s.append(f'<path d="M455 380 C455 410 200 410 175 380" stroke="{SEAL}" stroke-width="1.4" fill="none" stroke-dasharray="5 4" marker-end="url(#r)"/>')
    s.append(t(W / 2, 432, "不达标：审核打回，补检索并逐章重写，复核后再过质量门（修复轮数有上限）", 12.5, SEAL))
    s.append("</svg>")
    (OUT / "three-provinces.svg").write_text("\n".join(s), encoding="utf-8")


if __name__ == "__main__":
    architecture(); correction(); provinces()
