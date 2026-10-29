"""Assemble the narrated demo video: one still per scene + Chinese text-to-speech (macOS `say`) -> mp4.

Usage: python docs/demo/build_video.py <scenes.json> <out.mp4> [voice]
scenes.json: [{"image": "path.png", "text": "narration"}, ...]
Each scene lasts as long as its narration plus a short pause, so picture and voice never drift apart.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

PAUSE = 0.7


def run(*cmd: str) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )  # fmt: skip
    return float(out.stdout.strip())


def main() -> None:
    scenes = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    voice = sys.argv[3] if len(sys.argv) > 3 else "Tingting"
    work = Path(tempfile.mkdtemp(prefix="veriflow_video_"))
    clips: list[Path] = []
    for i, scene in enumerate(scenes):
        aiff, wav, clip = work / f"{i}.aiff", work / f"{i}.m4a", work / f"{i}.mp4"
        run("say", "-v", voice, "-r", "185", "-o", str(aiff), scene["text"])
        run("ffmpeg", "-loglevel", "error", "-y", "-i", str(aiff), "-ar", "44100", "-ac", "1", "-af", f"apad=pad_dur={PAUSE}", str(wav))
        seconds = duration(wav)
        run(
            "ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "25", "-i", scene["image"], "-i", str(wav),
            "-t", f"{seconds:.2f}", "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0e1117,format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-shortest", str(clip),
        )  # fmt: skip
        clips.append(clip)
        print(f"scene {i}: {seconds:.1f}s  {scene['image']}")
    listing = work / "list.txt"
    listing.write_text("".join(f"file '{c}'\n" for c in clips), encoding="utf-8")
    run("ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(out))
    print(f"video: {out}  {duration(out):.0f}s")


if __name__ == "__main__":
    main()
