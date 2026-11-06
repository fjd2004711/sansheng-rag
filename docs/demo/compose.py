"""Cut the demo video: recorded frames + camera moves + subtitles + chapter tags + narration -> mp4.

Inputs (docs/demo/build/): frames/<timestamp>.jpg and timeline.json from frontend/scripts/demo-record.mjs,
voice.json and voice/<scene>.wav from docs/demo/voice.py. The camera eases between the rectangles the recorder logged
(cropped from the 1.5x frames, so zoom-ins stay sharp); subtitles follow the sentence timings of the narration.

Usage: python docs/demo/compose.py [out.mp4] [--preview 0.25]
"""

from __future__ import annotations

import argparse
import bisect
import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
BUILD = HERE / "build"
OUT = HERE.parent / "submission" / "out" / "赛题一+【队伍名称】+三省-演示视频.mp4"
W, H, FPS = 1920, 1080, 30
KAI = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/88d6cc32a907955efa1d014207889413890573be.asset/AssetData/Kaiti.ttc"
SONG = "/System/Library/Fonts/Supplemental/Songti.ttc"
INK, PAPER, VERM = (35, 31, 26), (242, 236, 223), (168, 58, 44)
LIVE = {"live", "inspector", "gate", "repairs"}  # scenes showing the accelerated replay
FADE = 0.3


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.truetype(SONG, size)


SUB_FONT, TAG_FONT, BADGE_FONT = font(KAI, 42), font(KAI, 30), font(KAI, 26)


def ease(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return 4 * t**3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def fit(rect: list[float]) -> tuple[float, float, float, float]:
    """Grow a rectangle to 16:9 around its centre and keep it inside the page."""
    x0, y0, x1, y1 = rect
    w, h = max(x1 - x0, 480), max(y1 - y0, 270)
    if w / h > W / H:
        h = w * H / W
    else:
        w = h * W / H
    w, h = min(w, W), min(h, H)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    x0 = min(max(cx - w / 2, 0), W - w)
    y0 = min(max(cy - h / 2, 0), H - h)
    return x0, y0, x0 + w, y0 + h


def camera(cams: list[dict], t: float) -> tuple[float, float, float, float]:
    rect = fit(cams[0]["rect"])
    for c in cams[1:]:
        if c["t"] > t:
            break
        target = fit(c["rect"])
        k = ease((t - c["t"]) / c["dur"]) if c["dur"] else 1.0
        rect = tuple(a + (b - a) * k for a, b in zip(rect, target))  # type: ignore[assignment]
    return rect


CN_NUM = {c: i for i, c in enumerate("零一二三四五六七八九")}


def cn_int(s: str) -> int:
    if "十" not in s:
        return int("".join(str(CN_NUM[c]) for c in s))
    tens, _, ones = s.partition("十")
    return (CN_NUM[tens] if tens else 1) * 10 + (CN_NUM[ones] if ones else 0)


def written(text: str) -> str:
    """The narration spells numbers out for the voice; subtitles show them the way people write them."""
    text = text.replace("二〇二五", "2025 ")
    return re.sub(r"百分之([零一二三四五六七八九十]+)", lambda m: f"{cn_int(m.group(1))}%", text)


def chunks(cues: list[dict]) -> list[dict]:
    """Split long sentences at commas so a subtitle line stays short; time each piece by its length."""
    out = []
    for c in cues:
        text = written(c["text"]).rstrip("。")
        parts, buf = [], ""
        for piece in re.split(r"(?<=[，；：、])", text):
            if buf and len(buf) + len(piece) > 22:
                parts.append(buf)
                buf = piece
            else:
                buf += piece
        if buf:
            parts.append(buf)
        total = sum(len(p) for p in parts) or 1
        t = c["start"]
        for p in parts:
            d = (c["end"] - c["start"]) * len(p) / total
            out.append({"start": t, "end": t + d, "text": p.rstrip("，；：、")})
            t += d
    return out


def draw_subtitle(img: Image.Image, text: str) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    box = d.textbbox((0, 0), text, font=SUB_FONT)
    tw, th = box[2] - box[0], box[3] - box[1]
    x, y = (W - tw) / 2, H - 108
    d.rectangle((x - 30, y - 18, x + tw + 30, y + th + 22), fill=(*PAPER, 228))
    d.line((x - 30, y - 18, x - 30, y + th + 22), fill=(*VERM, 255), width=4)
    d.text((x - box[0], y - box[1]), text, font=SUB_FONT, fill=INK)


def draw_tag(img: Image.Image, tag: str) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    box = d.textbbox((0, 0), tag, font=TAG_FONT)
    tw, th = box[2] - box[0], box[3] - box[1]
    d.rectangle((40, 34, 40 + tw + 44, 34 + th + 26), fill=(*PAPER, 236), outline=(*INK, 255), width=2)
    d.rectangle((46, 40, 46 + 6, 28 + th + 26), fill=(*VERM, 255))
    d.text((64 - box[0], 47 - box[1]), tag, font=TAG_FONT, fill=INK)


def draw_badge(img: Image.Image, text: str) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    box = d.textbbox((0, 0), text, font=BADGE_FONT)
    tw, th = box[2] - box[0], box[3] - box[1]
    x1 = W - 40
    d.rectangle((x1 - tw - 36, 36, x1, 36 + th + 22), fill=(*VERM, 230))
    d.text((x1 - tw - 18 - box[0], 47 - box[1]), text, font=BADGE_FONT, fill=(250, 245, 236))


@lru_cache(maxsize=4)
def load(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default=str(OUT))
    ap.add_argument("--preview", type=float, default=0, help="scale (e.g. 0.25) and only every 10th frame, for a quick look")
    args = ap.parse_args()
    voice = {s["id"]: s for s in json.loads((BUILD / "voice.json").read_text(encoding="utf-8"))["scenes"]}
    speed = json.loads((BUILD / "voice.json").read_text(encoding="utf-8"))["speed"]
    timeline = json.loads((BUILD / "timeline.json").read_text(encoding="utf-8"))
    dsf = timeline["dsf"]
    frames = sorted((float(p.stem), str(p)) for p in (BUILD / "frames").glob("*.jpg"))
    stamps = [f[0] for f in frames]

    dsf = Image.open(frames[0][1]).width / W  # the scale the frames really have

    def frame_at(ts: float) -> Image.Image:
        i = max(0, bisect.bisect_right(stamps, ts) - 1)
        return load(frames[i][1])

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    audio = BUILD / "narration.wav"
    inputs, filters = [], []
    for i, sc in enumerate(timeline["scenes"]):
        inputs += ["-i", str(BUILD / "voice" / f"{sc['id']}.wav")]
        filters.append(f"[{i}]apad=whole_dur={voice[sc['id']]['duration']}[a{i}]")
    n = len(timeline["scenes"])
    graph = ";".join(filters) + ";" + "".join(f"[a{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1,loudnorm=I=-16:TP=-1.5[out]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", str(audio)], check=True)

    scale = args.preview or 1.0
    ow, oh = int(W * scale) // 2 * 2, int(H * scale) // 2 * 2
    fps = FPS / 10 if args.preview else FPS
    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{ow}x{oh}", "-r", str(fps),
         "-i", "-", "-i", str(audio), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    prev_last: Image.Image | None = None
    for sc in timeline["scenes"]:
        v = voice[sc["id"]]
        subs = chunks(v["cues"])
        n_frames = round(v["duration"] * fps)
        last = None
        for k in range(n_frames):
            t = k / fps
            src = frame_at(sc["start"] + t)
            x0, y0, x1, y1 = camera(sc["cams"], t)
            img = src.crop(tuple(round(c * dsf) for c in (x0, y0, x1, y1))).resize((W, H), Image.LANCZOS)
            if v["tag"]:
                draw_tag(img, v["tag"])
            if sc["id"] in LIVE:
                draw_badge(img, f"真实运行记录 · {speed} 倍速回放")
            cur = next((s["text"] for s in subs if s["start"] <= t < s["end"] + 0.25), None)
            if cur:
                draw_subtitle(img, cur)
            if prev_last is not None and t < FADE:
                img = Image.blend(prev_last, img, ease(t / FADE))
            last = img
            frame = img if scale == 1 else img.resize((ow, oh), Image.BILINEAR)
            enc.stdin.write(frame.tobytes())  # type: ignore[union-attr]
        prev_last = last
        print(f"{sc['id']:10s} {n_frames} frames")
    enc.stdin.close()  # type: ignore[union-attr]
    enc.wait()
    print(f"video: {out}")


if __name__ == "__main__":
    main()
