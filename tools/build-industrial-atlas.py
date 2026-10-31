"""Rebuild the industrial kit's deterministic paint/marking atlas (Pillow)."""
from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SIZE = 512
PALETTE = [
    ("IVORY", (192, 193, 181)), ("HABITAT", (207, 207, 192)),
    ("CARGO", (187, 190, 179)), ("OCHRE", (177, 124, 47)),
    ("OXIDE", (133, 79, 55)), ("SLATE", (76, 103, 116)),
    ("SERVICE", (91, 102, 102)), ("AIRLOCK", (177, 181, 171)),
    ("CAUTION", (185, 137, 49)), ("LOUVERS", (53, 64, 67)),
    ("RADIATOR", (48, 58, 63)), ("PRESSURE", (199, 201, 188)),
    ("CHASSIS", (64, 72, 73)), ("SERVICE BUS", (76, 82, 79)),
    ("REGISTRY", (198, 198, 180)), ("BULK", (198, 200, 188)),
]

def font(size):
    for name in ["C:/Windows/Fonts/consolab.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]:
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()

atlas = Image.new("RGB", (SIZE * 4, SIZE * 4))
for index, (name, color) in enumerate(PALETTE):
    rng = random.Random(3701 + index)
    tile = Image.new("RGB", (SIZE, SIZE), color)
    pixels = tile.load()
    for y in range(SIZE):
        for x in range(SIZE):
            n = rng.gauss(0, 1.7) - 4 * y / SIZE
            pixels[x, y] = tuple(max(0, min(255, int(c + n))) for c in color)
    d = ImageDraw.Draw(tile)
    seam = tuple(int(c * .56) for c in color)
    highlight = tuple(min(255, c + 22) for c in color)
    d.rounded_rectangle((10, 10, 501, 501), radius=18, outline=seam, width=4)
    d.rounded_rectangle((17, 17, 495, 495), radius=14, outline=highlight, width=2)
    if index == 8:
        for x in range(-512, 1024, 96):
            d.polygon([(x, 0), (x+46, 0), (x-466, 512), (x-512, 512)], fill=(42, 47, 43))
    elif index in [9, 10]:
        for y in range(40, 480, 22 if index == 9 else 11):
            d.rectangle((32, y, 480, y+9), fill=(24, 32, 35))
            d.line((32, y+10, 480, y+10), fill=(103, 113, 110), width=2)
    elif index == 13:
        for y in range(30, 490, 32):
            d.rectangle((28, y, 484, y+12), fill=seam)
            d.line((28, y+14, 484, y+14), fill=highlight, width=2)
    elif index == 11:
        for x in [128, 256, 384]:
            d.line((x, 14, x, 498), fill=seam, width=2)
            d.line((x+3, 15, x+3, 497), fill=highlight, width=2)
        d.line((15, 256, 497, 256), fill=seam, width=2)
        d.text((150, 340), "PRESSURE VESSEL", font=font(15), fill=seam)
        d.text((150, 365), "DW / 030   N2", font=font(18), fill=seam)
        d.rectangle((150, 395, 285, 404), fill=(175, 128, 49))
    elif index == 15:
        for x in [128, 256, 384]:
            d.line((x, 16, x, 496), fill=tuple(int(c*.8) for c in color), width=2)
            d.line((x+3, 17, x+3, 495), fill=highlight, width=1)
        for y in [128, 256, 384]:
            d.line((16, y, 496, y), fill=tuple(int(c*.83) for c in color), width=1)
        d.text((216, 98), "FLUID / 04", font=font(12), fill=seam)
        d.text((216, 117), "DW TRANSPORT", font=font(9), fill=seam)
        d.rectangle((216, 136, 294, 140), fill=(175, 128, 49))
    else:
        d.line((45, 325, 465, 325), fill=seam, width=2)
        d.line((46, 328, 466, 328), fill=highlight, width=2)
        d.rounded_rectangle((38, 359, 230, 468), radius=5, fill=tuple(int(c*.92) for c in color), outline=seam, width=2)
        d.rectangle((50, 375, 61, 448), fill=(193, 139, 55))
        ink = (43, 53, 55) if index not in [4, 5, 6, 12] else (190, 193, 175)
        d.text((74, 376), f"DW / {index+1:02}", font=font(21), fill=ink)
        d.text((74, 410), name, font=font(15), fill=ink)
        d.text((40, 46), "INDUSTRIAL SYSTEMS", font=font(15), fill=ink)
        d.text((40, 72), f"SERIES 04   /   {index+30:03}", font=font(12), fill=ink)
        d.rectangle((392, 366, 458, 406), fill=(172, 129, 52))
        d.polygon([(424, 372), (400, 400), (449, 400)], outline=(43, 48, 43), width=3)
        d.line((424, 382, 424, 391), fill=(43, 48, 43), width=3)
        for x in range(265, 360, 5):
            d.rectangle((x, 430, x+rng.randint(1, 3), 454), fill=ink)
    for x in ([] if index == 15 else [27, 484]):
        for y in [27, 256, 484]:
            d.ellipse((x-5, y-5, x+5, y+5), fill=seam)
            d.line((x-3, y-2, x+2, y-2), fill=highlight, width=2)
            for k in range(rng.randrange(3, 11)):
                d.line((x+rng.randrange(-3, 4), y+6+k, x+rng.randrange(-2, 3), y+7+k), fill=tuple(int(c*.83) for c in color))
    for _ in range(240):
        side = rng.randrange(4)
        a, b = rng.randrange(18, 495), rng.choice([12, 18, 492, 498]) + rng.randrange(-4, 5)
        x, y = (a, b) if side < 2 else (b, a)
        length = rng.randrange(1, 9)
        d.line((x, y, x+length, y+rng.randrange(-1, 2)), fill=(95, 99, 91), width=rng.choice([1, 1, 2]))
    atlas.paste(tile, ((index % 4)*SIZE, (index // 4)*SIZE))

target = ROOT / "assets/ships/industrial-kit/panels.png"
atlas.save(target, optimize=True)
print(target.relative_to(ROOT))
