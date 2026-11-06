"""Narration for the demo video: the script, its numbers (read from docs/submission/data.json), and the voice-over.

The script plainly describes what the interface shows. Each sentence is synthesised on its own (Microsoft neural voice
via edge-tts) and joined with short, slightly uneven pauses. The sentence timings are
written next to the audio, so the recorder can time clicks to the words and the compositor can draw subtitles.

Usage: uv run --with edge-tts python docs/demo/voice.py [--voice zh-CN-YunyangNeural] [--rate +0%]
Writes docs/demo/build/voice/<scene>.wav, docs/demo/build/voice.json and docs/demo/build/cards/*.html.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import re
import subprocess
from pathlib import Path

import edge_tts

HERE = Path(__file__).parent
BUILD = HERE / "build"
DATA = json.loads((HERE.parent / "submission" / "data.json").read_text(encoding="utf-8"))
R = DATA["by_file"]
P8, P9, P2 = R["p8-nev-pipeline.json"], R["p9-employment-latest.json"], R["p2-nev-parallel.json"]
SP, VE = DATA["serial_vs_parallel"], DATA["verification"]
# scenes whose picture needs longer than their narration (card animations, a page change)
MIN_SECONDS = {"close": 6.5, "synthesis": 6.5}
SPEED = 8  # the mock backend replays the saved run this many times faster than it really ran

# id -> (chapter tag shown on screen, narration)
SCENES: list[tuple[str, str, str]] = [
    ("open", "",
     "三省是一个多智能体编排调度平台。平台把复杂任务分配给多个智能体协作完成，并由独立的核查角色检查结果。"),
    ("name", "名字的由来",
     "平台名称取自唐代的三省制。中书省负责起草，门下省负责审核，尚书省负责执行。"
     "平台中的角色按同样的方式分工，负责撰写的智能体不参与审核，负责审核的智能体不参与撰写。"),
    ("spec", "卷一 · 团队与工作流定义",
     "工作流定义页用于查看和编辑一个场景的完整定义。"
     "定义包括知识库、七个智能体、团队、工作流和运行策略，上方画布和下方的 YAML 对应同一份定义。"
     "独立核查员只能读取成稿和证据。"
     "如果在 YAML 中允许它读取撰稿人的推理过程，校验时会直接报错。"
     "这条规则保证核查与撰写相互隔离。"),
    ("newrun", "卷二 · 新建运行",
     "新建一次运行，选择调研报告工作流。"
     "输入主题：2025 年中国新能源汽车销量与渗透率情况，然后开始运行。"),
    ("live", "卷三 · 动态调度",
     f"以下画面是一次真实运行记录的 {SPEED} 倍速回放。"
     f"规划师先生成提纲和检索词，随后 {P8['search_batches']} 个检索批次并行执行。"
     f"检索完成后，{P8['sections']} 个章节同时撰写，另有一路检索专门查找全国口径的官方数据。"
     "核查员按章节流水线工作，每写完一章就核查一章。"
     "下方的调度时间线中，每一条代表一个任务，重叠的部分表示并行执行。"),
    ("inspector", "卷三 · 动态调度",
     "点击核查员节点，可以查看它的角色、模型和所用的资源池。"
     "独立性一栏显示，它看不到撰稿人的推理，会自行重新检索证据。"),
    ("gate", "卷四 · 质量门与自我循环",
     f"首次质量门检查时，已核实说法占比为 {P8['verified_first']}%，低于 50% 的门槛，没有通过。"
     "系统先诊断失败类型，这几章的问题都是证据不足。"
     "随后调度器在运行中插入两组任务：补充检索，以及逐章重写后再由核查员复核。"),
    ("repairs", "卷四 · 质量门与自我循环",
     "重写结果只有在复核后不低于原稿时才会被采用。"
     f"本轮共重写 {len(P8['repairs'])} 章，其中 {P8['repairs_rejected']} 章复核结果变差，保留原稿，{P8['repairs_accepted']} 章被采用。"
     f"复查时已核实比例达到 {P8['verified_final']}%，质量门放行。"
     "修复的轮次和预算都有上限，一轮修复没有进展时循环也会停止。"),
    ("report", "卷五 · 结果交付",
     "质量门放行后，分析师撰写综合研判，主编统稿，生成最终报告。"
     "报告中的每条说法都标注了核实等级，包括已核实、单一来源和有争议。"
     "核心结论优先采用全国口径的数据，证据不足的内容会明确标注。"),
    ("synthesis", "卷五 · 结果交付",
     "行动建议的每一条都列出依据强度、前提条件和风险。"),
    ("factcheck", "卷六 · 事实核查场景",
     "更换一份工作流定义，同一个平台就可以用于事实核查，平台代码不需要修改。"
     "这段输入中的人均可支配收入被故意写错，核查员将其判定为未能核实，并指出来源中的数据与之不同。"),
    ("insights", "卷七 · 反馈优化",
     "改进建议页汇总各次运行的失败类型和用户反馈。"
     "这些建议供人工参考，调整策略后需要用金标集重新评测。"),
    ("results", "实测数据",
     f"以上数据均来自保存的真实运行记录。同一新能源主题，总耗时从 {P2['wall_seconds']} 秒降到 {P8['wall_seconds']} 秒。"
     f"同一份工作流定义，起草阶段串行执行需要 {SP['serial_seconds']} 秒，并行执行需要 {SP['parallel_seconds']} 秒。"
     "在两套金标测试集上，没有出现错误说法被判为已核实的情况。"),
    ("close", "",
     "以上是三省平台的演示。谢谢观看。"),
]  # fmt: skip


def sentences(text: str) -> list[str]:
    parts = re.findall(r"[^。？！]+[。？！]?", text)
    return [p.strip() for p in parts if p.strip()]


def run(*cmd: str) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def seconds(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True)  # fmt: skip
    return float(out.stdout)


async def speak(text: str, voice: str, rate: str, out: Path) -> None:
    await edge_tts.Communicate(text, voice, rate=rate).save(str(out))


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="zh-CN-YunyangNeural")
    ap.add_argument("--rate", default="+0%")
    args = ap.parse_args()
    vdir = BUILD / "voice"
    vdir.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(3)
    scenes = []
    for sid, tag, text in SCENES:
        cues, parts, t = [], [], 0.0
        for i, sent in enumerate(sentences(text)):
            mp3, wav = vdir / f"{sid}-{i}.mp3", vdir / f"{sid}-{i}.wav"
            if not mp3.exists():
                await speak(sent, args.voice, args.rate, mp3)
            # trim the synthesiser's own leading / trailing silence, then add a human-length breath after the sentence
            run("ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-af",
                "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                "-ar", "48000", "-ac", "1", str(wav))  # fmt: skip
            d = seconds(wav)
            gap = 0.42 if sent.endswith(("。", "！")) else 0.32
            gap += rnd.uniform(-0.06, 0.1)
            cues.append({"start": round(t, 3), "end": round(t + d, 3), "text": sent})
            parts.append((wav, gap))
            t += d + gap
        listing = vdir / f"{sid}.txt"
        lines = []
        for wav, gap in parts:
            sil = vdir / f"sil-{round(gap * 1000)}.wav"
            if not sil.exists():
                run("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", f"{gap:.3f}", str(sil))
            lines += [f"file '{wav.name}'", f"file '{sil.name}'"]
        listing.write_text("\n".join(lines) + "\n", encoding="utf-8")
        run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(vdir / f"{sid}.wav"))
        dur = seconds(vdir / f"{sid}.wav")
        scenes.append({"id": sid, "tag": tag, "duration": round(max(dur + 0.5, MIN_SECONDS.get(sid, 0)), 2), "cues": cues})
        print(f"{sid:10s} {dur:6.1f}s  {len(cues)} sentences")
    total = sum(s["duration"] for s in scenes)
    (BUILD / "voice.json").write_text(json.dumps({"speed": SPEED, "scenes": scenes}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"total {total:.0f}s ({total / 60:.1f} min)")
    cards()


def cards() -> None:
    """Title, results and closing cards, styled like the app (rice paper, Song / Kai, vermilion seal)."""
    out = BUILD / "cards"
    out.mkdir(parents=True, exist_ok=True)
    values = {
        "nev_first": f"{P2['wall_seconds']}", "nev_last": f"{P8['wall_seconds']}", "serial": f"{SP['serial_seconds']}",
        "parallel": f"{SP['parallel_seconds']}", "speedup": f"{SP['speedup']}", "vf": f"{P8['verified_first']}",
        "vl": f"{P8['verified_final']}", "fp_real": f"{round(VE['real']['false_pass']['rate'] * VE['real']['false_pass']['n'])}",
        "fp_real_n": f"{VE['real']['false_pass']['n']}", "fp_syn": f"{round(VE['synthetic']['false_pass']['rate'] * VE['synthetic']['false_pass']['n'])}",
        "fp_syn_n": f"{VE['synthetic']['false_pass']['n']}", "tests": f"{DATA['tests']['backend_passed']}",
    }  # fmt: skip
    for src in (HERE / "cards").glob("*.html"):
        text = src.read_text(encoding="utf-8")
        text = re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], text)
        (out / src.name).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
