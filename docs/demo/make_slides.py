"""Draw the explanatory slides of the demo video (1920x1080). Numbers on the results slide come from
artifacts/orchestration-eval.json, never typed by hand.

Usage: python docs/demo/make_slides.py <out_dir> [eval.json]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG, FG, MUTED = (14, 17, 23), (236, 240, 245), (140, 150, 165)
ACCENT, GREEN, AMBER, RED, BLUE = (99, 179, 237), (72, 187, 120), (246, 173, 85), (245, 101, 101), (66, 153, 225)
FONT = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc"
FALLBACK = "/System/Library/Fonts/STHeiti Medium.ttc"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in (FONT, FALLBACK):
        try:
            return ImageFont.truetype(path, size, index=4 if bold and path == FONT else 0)
        except OSError:
            continue
    return ImageFont.load_default()


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    return img, ImageDraw.Draw(img)


def text(d: ImageDraw.ImageDraw, xy: tuple[int, int], s: str, size: int, fill=FG, bold=False) -> int:
    d.text(xy, s, font=font(size, bold), fill=fill)
    return xy[1] + int(size * 1.45)


def box(d, x, y, w, h, title, lines, color=ACCENT):
    d.rounded_rectangle((x, y, x + w, y + h), radius=18, outline=color, width=3, fill=(22, 27, 36))
    text(d, (x + 24, y + 18), title, 30, color, True)
    cy = y + 66
    for line in lines:
        cy = text(d, (x + 24, cy), line, 24, FG)


def header(d, title, sub=""):
    text(d, (90, 60), title, 56, FG, True)
    if sub:
        text(d, (90, 140), sub, 28, MUTED)


def slide_title(out: Path) -> None:
    img, d = canvas()
    text(d, (140, 330), "衡析 VeriFlow", 120, FG, True)
    text(d, (140, 490), "可验证的多智能体编排调度平台", 56, ACCENT)
    text(d, (140, 600), "声明式定义  ·  动态调度  ·  独立核查  ·  有界自循环  ·  反馈优化", 34, MUTED)
    text(d, (140, 940), "赛题：大模型 Agent 工具编排调度平台", 28, MUTED)
    img.save(out / "01_title.png")


def slide_why(out: Path) -> None:
    img, d = canvas()
    header(d, "对标框架缺什么", "LobeHub、DeepSeek Harness 等主流 Agent Harness 的共同短板")
    box(d, 90, 230, 540, 330, "LobeHub 群组", ["主管模型决定下一位发言", "以对话轮转为核心", "没有工作流图、并发调度", "没有结果验证"], AMBER)
    box(d, 690, 230, 540, 330, "DeepSeek Harness", ["插件化、轨迹可回放", "偏单 Agent 编码场景", "多智能体只到子智能体调度", "没有独立验证机制"], AMBER)
    box(d, 1290, 230, 540, 330, "共同缺口", ["执行者自己报告“做完了”", "就当作任务完成", "缺少强制隔离的核查员", "和有上限的失败修复"], RED)
    text(d, (90, 640), "VeriFlow 的三个答案", 40, FG, True)
    box(d, 90, 710, 540, 260, "独立验证", ["核查员与执行者隔离", "确定性规则 + 重新检索复核"], GREEN)
    box(d, 690, 710, 540, 260, "有界自循环", ["先诊断失败类型再修复", "轮次与预算都有上限"], GREEN)
    box(d, 1290, 710, 540, 260, "动态调度", ["并行扇出、资源池、模型降级", "运行中插入补检索任务"], GREEN)
    img.save(out / "02_why.png")


def slide_arch(out: Path) -> None:
    img, d = canvas()
    header(d, "平台架构", "声明式定义 → 编译 → 调度执行 → 验证反馈，每一步都落成可回放的事件")
    layers = [
        ("定义层", "知识库 · Agent · 团队 · 工作流 · 策略（YAML，导入时校验：循环依赖、缺失角色、越权核查员）", ACCENT),
        ("编排层", "工作流编译成节点图：agent / map 并行扇出 / gate 质量门 / loop 自循环 / merge 汇总", BLUE),
        ("调度层", "就绪集 + 优先级 · 搜索/模型资源池 · 重试超时 · 预算 · 模型降级 · 运行时插入任务", GREEN),
        ("执行层", "LangChain Agent + 检索（稠密+BM25+RRF+重排）+ 网页搜索与抓取 + 数字逐字核对", AMBER),
        ("验证与反馈层", "独立核查员 · 质量门 · 失败分类 → 修复路由 · 用户反馈 → 改进建议 · 金标回归", RED),
    ]
    y = 230
    for name, desc, color in layers:
        d.rounded_rectangle((90, y, 1830, y + 120), radius=16, outline=color, width=3, fill=(22, 27, 36))
        text(d, (120, y + 14), name, 36, color, True)
        text(d, (120, y + 66), desc, 26, FG)
        y += 140
    text(d, (90, 950), "技术栈：FastAPI · PostgreSQL · Qdrant · LangChain · 自研 asyncio 调度器 · Next.js · React Flow", 26, MUTED)
    img.save(out / "03_arch.png")


def slide_results(out: Path, eval_path: Path | None) -> None:
    img, d = canvas()
    header(d, "实测结果", "全部指标由评测脚本从真实运行的事件日志生成")
    if not eval_path or not eval_path.exists():
        text(d, (90, 300), "（评测结果尚未生成）", 36, MUTED)
        img.save(out / "05_results.png")
        return
    data = json.loads(eval_path.read_text(encoding="utf-8"))
    y = 230
    cols = [90, 640, 940, 1240, 1540]
    for x, h in zip(cols, ["主题", "总耗时", "并行加速", "修复轮次", "核查员下调"], strict=True):
        text(d, (x, y), h, 26, MUTED, True)
    y += 56
    for r in data["runs"]:
        vals = [r["topic"][:20], f"{round(r['wall_seconds'] or 0)} 秒", f"{r['parallel_speedup']}×", str(r["repair_rounds"]), f"{r['verifier_downgrades']} 条"]
        for x, v in zip(cols, vals, strict=True):
            text(d, (x, y), v, 28, FG)
        y += 50
    y += 30
    text(d, (90, y), "质量门：首次检查 → 自循环修复后", 34, FG, True)
    y += 60
    labels = {"verified_ratio": "已核实比例", "authoritative_sections": "权威来源覆盖章节", "unsupported_numbers": "来源里找不到的数字", "scope_issues": "范围错置章节"}
    for r in data["runs"][:2]:
        text(d, (90, y), r["topic"][:24], 26, ACCENT, True)
        y += 44
        for k, label in labels.items():
            a, b = r["gate_first"].get(k), r["gate_last"].get(k)
            fmt = (lambda v: f"{round(v * 100)}%" if v is not None and k in ("verified_ratio", "authoritative_sections") else str(v))
            text(d, (130, y), f"{label}：{fmt(a)}  →  {fmt(b)}", 26, FG)
            y += 40
        y += 14
    sv = data.get("serial_vs_parallel")
    if sv:
        text(d, (1000, 700), "串行 vs 并行（同一主题，起草阶段实测）", 34, FG, True)
        text(d, (1000, 760), f"串行配置：{round(sv['serial_seconds'])} 秒", 30, FG)
        text(d, (1000, 810), f"并行调度：{round(sv['parallel_seconds'])} 秒", 30, GREEN)
        text(d, (1000, 860), f"实测加速：{sv['measured_speedup']}×", 40, GREEN, True)
    img.save(out / "05_results.png")


def slide_end(out: Path) -> None:
    img, d = canvas()
    header(d, "总结与边界")
    items = [
        ("做到了", GREEN, ["声明式定义 + 校验；两套内置团队，换定义不改代码", "动态调度：并行扇出、资源池、模型降级、运行时插入任务", "独立核查 + 质量门 + 有界自循环，修不好的如实披露", "全链路事件可回放：甘特图、门检查、修复轨迹", "反馈与失败统计 → 改进建议（人工应用，金标回归把关）"]),
        ("没做到（如实说明）", AMBER, ["断点续跑：运行状态持久化了，但中断后需整体重跑", "改进建议是规则提示，不会自动改提示词或策略", "样本主题少，结论是实测但不是统计显著", "免费搜索会被限流，商用需要付费搜索源"]),
    ]
    y = 220
    for title, color, lines in items:
        y = text(d, (90, y), title, 38, color, True) + 8
        for line in lines:
            y = text(d, (130, y), "· " + line, 28, FG)
        y += 30
    img.save(out / "09_end.png")


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    eval_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    slide_title(out)
    slide_why(out)
    slide_arch(out)
    slide_results(out, eval_path)
    slide_end(out)
    print("slides:", sorted(p.name for p in out.glob("*.png")))
