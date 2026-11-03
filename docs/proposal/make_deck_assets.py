"""Images for the 三省 deck: dark background, cover art with a brush-script title, logo, and screenshots with the old-brand
header cropped off. Usage: python docs/proposal/make_deck_assets.py"""

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
OUT = HERE / "deck_assets"
SHOTS = HERE / "shots"
W, H = 1920, 1080
NAVY = (6, 16, 40)
BRUSH = next(p for p in Path("/System/Library/AssetsV2").rglob("Xingkai.ttc"))
ROLE = [(31, 95, 191), (192, 57, 43), (46, 125, 91)]  # 中书 / 门下 / 尚书


def background() -> Image.Image:
    img = Image.new("RGB", (W, H), NAVY)
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((900, -500, 2500, 700), fill=(20, 70, 160))
    d.ellipse((-600, 500, 700, 1500), fill=(10, 45, 110))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    img = ImageChops.add(img, glow)
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(grid)
    for x in range(0, W, 60):
        g.line((x, 0, x, H), fill=(120, 170, 255, 14))
    for y in range(0, H, 60):
        g.line((0, y, W, y), fill=(120, 170, 255, 14))
    return Image.alpha_composite(img.convert("RGBA"), grid).convert("RGB")


def network(img: Image.Image) -> None:
    rnd = random.Random(7)
    pts = [(rnd.randint(980, 1900), rnd.randint(40, 1040)) for _ in range(46)]
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i, a in enumerate(pts):
        for b in pts[i + 1 :]:
            if math.dist(a, b) < 210:
                d.line((*a, *b), fill=(110, 170, 255, 70), width=2)
    for x, y in pts:
        r = rnd.choice([4, 5, 7])
        d.ellipse((x - r, y - r, x + r, y + r), fill=(170, 210, 255, 230))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer.filter(ImageFilter.GaussianBlur(0.6))).convert("RGB"))


def three_circles(img: Image.Image, cx: int, cy: int, r: int) -> None:
    centers = [(cx, cy - int(r * 0.62)), (cx + int(r * 0.62), cy + int(r * 0.45)), (cx - int(r * 0.62), cy + int(r * 0.45))]
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for (x, y), c in zip(centers, ROLE):
        d = ImageDraw.Draw(layer)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(*c, 120), outline=(*c, 255), width=5)
    halo = layer.filter(ImageFilter.GaussianBlur(26))
    base = Image.alpha_composite(img.convert("RGBA"), halo)
    img.paste(Image.alpha_composite(base, layer).convert("RGB"))


def title_art(text: str, size: int) -> Image.Image:
    font = ImageFont.truetype(str(BRUSH), size, index=0)
    pad = 120
    box = font.getbbox(text)
    w, h = box[2] - box[0] + pad * 2, box[3] - box[1] + pad * 2
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text((pad - box[0], pad - box[1]), text, font=font, fill=255)
    grad = Image.new("RGB", (w, h))
    gd = ImageDraw.Draw(grad)
    for y in range(h):
        t = y / h
        c = (int(255 - 25 * t), int(250 - 70 * t), int(235 - 140 * t))  # white → gold
        gd.line((0, y, w, y), fill=c)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    halo = Image.new("RGBA", (w, h), (80, 150, 255, 0))
    halo.putalpha(mask.filter(ImageFilter.GaussianBlur(22)).point(lambda v: min(255, v * 2)))
    out = Image.alpha_composite(out, halo)
    out.paste(grad, (0, 0), mask)
    return out


def cover() -> None:
    img = background()
    network(img)
    three_circles(img, 1500, 540, 250)
    art = title_art("三省", 500)
    base = img.convert("RGBA")
    base.alpha_composite(art, (20, 90))
    base.convert("RGB").save(OUT / "cover.png")


def thanks() -> None:
    img = background()
    network(img)
    three_circles(img, 1500, 540, 250)
    img.save(OUT / "thanks.png")


def logo() -> None:
    s = 300
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = 85
    for (x, y), c in zip([(150, 95), (200, 190), (100, 190)], ROLE):
        d.ellipse((x - r, y - r, x + r, y + r), fill=(*c, 150), outline=(*c, 255), width=6)
    img.save(OUT / "logo.png")


def crop_shots() -> None:
    (OUT / "shots").mkdir(exist_ok=True)
    for f in SHOTS.glob("*.png"):
        im = Image.open(f)
        if im.width == 2160:  # app screenshots: drop the top bar, which still shows the old product name
            im = im.crop((0, 72, im.width, im.height))
        im.save(OUT / "shots" / f.name)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    background().save(OUT / "bg.png")
    cover()
    thanks()
    logo()
    crop_shots()
    print("ok", BRUSH)
