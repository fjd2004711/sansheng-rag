"""Images for the 三省 deck, styled after a thread-bound woodblock book: paper, an indigo cover with four-hole
stitching, the fishtail mark of the block centre, a small seal, and figure crops of the real screenshots in shots/.

Usage: python docs/proposal/make_deck_assets.py
"""

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
OUT = HERE / "deck_assets"
SHOTS = HERE / "shots"
W, H = 1920, 1080
PAPER = (242, 236, 223)
INDIGO = (40, 52, 78)
INK = (35, 31, 26)
VERMILION = (168, 58, 44)
THREAD = (232, 226, 210)
SONGTI = "/System/Library/Fonts/Supplemental/Songti.ttc"

# name -> (source screenshot, crop box in its pixels); None keeps the whole image
FIGURES = {
    "spec-yaml": ("spec-yaml.png", (361, 86, 2160, 1350)),
    "live": ("c-live.png", None),
    "gate": ("c-gate.png", None),
    "inspector": ("orch-inspector.png", (1640, 230, 2160, 880)),
    "chat-answer": ("chat-answer.png", None),
    "chat-trace": ("chat-trace.png", (1150, 0, 2160, 1350)),
    "report-top": ("report-orch-top.png", (361, 86, 2160, 1350)),
    "report-diagrams": ("report-diagrams.png", (900, 160, 1980, 1350)),
    "about": ("about.png", (715, 390, 1492, 1002)),
}


def songti(size: int, style: str) -> ImageFont.FreeTypeFont:
    for index in range(8):
        font = ImageFont.truetype(SONGTI, size, index=index)
        if font.getname() == ("Songti SC", style):
            return font
    raise LookupError(style)


def textured(color: tuple[int, int, int], seed: int, fibres: int, amp: int) -> Image.Image:
    """A flat colour with fine grain and a few long fibres, like handmade paper or dyed cloth."""
    rnd = random.Random(seed)
    img = Image.new("RGB", (W, H), color)
    grain = Image.effect_noise((W, H), amp).convert("L")
    img = Image.blend(img, Image.merge("RGB", (grain, grain, grain)), 0.035)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(fibres):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        dx, dy = rnd.uniform(-40, 40), rnd.uniform(-12, 12)
        shade = rnd.choice([(120, 100, 70, 22), (255, 255, 255, 30)])
        d.line((x, y, x + dx, y + dy), fill=shade, width=1)
    img = Image.alpha_composite(img.convert("RGBA"), layer.filter(ImageFilter.GaussianBlur(0.4)))
    vignette = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vignette).rectangle((60, 60, W - 60, H - 60), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(160))
    dark = Image.new("RGBA", (W, H), (*[max(0, c - 18) for c in color], 255))
    return Image.composite(img, dark, vignette).convert("RGB")


def cover() -> Image.Image:
    """Indigo cover with four-hole stitching (四眼钉线) along the left spine."""
    img = textured(INDIGO, seed=11, fibres=900, amp=60)
    d = ImageDraw.Draw(img)
    x_hole, x_fold = 62, 118
    d.line((x_fold, 0, x_fold, H), fill=(30, 40, 62), width=3)
    holes = [150, 410, 670, 930]
    for y in holes:  # thread wraps round the spine at every hole
        d.line((0, y, x_hole, y), fill=THREAD, width=5)
    d.line((x_hole, 0, x_hole, H), fill=THREAD, width=5)  # thread along the spine, and round the head and tail
    for y in holes:
        d.ellipse((x_hole - 7, y - 7, x_hole + 7, y + 7), fill=(22, 28, 44))
    return img.filter(ImageFilter.GaussianBlur(0.3))


def fishtail() -> Image.Image:
    """The black fishtail (鱼尾) printed in the block centre of a woodblock page."""
    w, h = 240, 150
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w, 14), fill=(*INK, 255))
    d.polygon([(0, 14), (w, 14), (w, h), (w // 2, h - 58), (0, h)], fill=(*INK, 255))
    return img


def seal(size: int = 480) -> Image.Image:
    """A small zhuwen (red-character) seal: vermilion strokes and border on transparent ground, a little worn."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    b = size // 16
    d.rectangle((b, b, size - b, size - b), outline=(*VERMILION, 255), width=size // 18)
    font = songti(int(size * 0.34), "Black")
    for i, ch in enumerate("三省"):
        box = font.getbbox(ch)
        cw, chh = box[2] - box[0], box[3] - box[1]
        d.text(((size - cw) / 2 - box[0], size * (0.3 if i == 0 else 0.7) - chh / 2 - box[1]), ch, font=font, fill=(*VERMILION, 255))
    rnd = random.Random(5)
    wear = Image.new("L", (size, size), 255)
    wd = ImageDraw.Draw(wear)
    for _ in range(size * 3):
        x, y, r = rnd.randrange(size), rnd.randrange(size), rnd.choice([1, 1, 2, 2, 3])
        wd.ellipse((x - r, y - r, x + r, y + r), fill=rnd.randint(0, 150))
    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", (size, size), 0), wear))
    return img.filter(ImageFilter.GaussianBlur(0.6))


def figures() -> None:
    (OUT / "fig").mkdir(parents=True, exist_ok=True)
    for name, (src, box) in FIGURES.items():
        im = Image.open(SHOTS / src).convert("RGB")
        (im.crop(box) if box else im).save(OUT / "fig" / f"{name}.png")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    textured(PAPER, seed=7, fibres=700, amp=40).save(OUT / "paper.png")
    cover().save(OUT / "cover.png")
    fishtail().save(OUT / "fishtail.png")
    seal().save(OUT / "seal.png")
    figures()
    print("ok")
