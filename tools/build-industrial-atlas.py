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
    # Baked relief cues: seams, inset access plates, fasteners and rubbed edges.
    # One existing color atlas: no added shader, material, draw or geometry cost.
    if index not in [8, 9, 10, 13]:
        for x, y, w, h in [(288, 164, 156, 82), (56, 182, 116, 94)]:
            d.rectangle((x, y, x+w, y+h), fill=tuple(int(c*.94) for c in color), outline=seam, width=2)
            d.line((x+2, y+h+2, x+w, y+h+2), fill=highlight, width=2)
            for bx in [x+6, x+w-6]:
                for by in [y+6, y+h-6]:
                    d.ellipse((bx-2, by-2, bx+2, by+2), fill=seam)
            for n in ([] if index in [11, 15] else range(7)):
                yy=y+18+n*5
                d.line((x+16, yy, x+w-16, yy), fill=seam, width=2)
                d.line((x+16, yy+2, x+w-16, yy+2), fill=highlight, width=1)
        for _ in ([] if index in [11, 15] else range(70)):
            x, y = rng.randrange(24, 488), rng.randrange(24, 488)
            d.line((x, y, x+rng.randrange(2, 14), y), fill=tuple(int(c*.88) for c in color))
    # Keep panel edges clean: random dark chips magnify into loose pixel clusters.
    if index == 14:
        # Dedicated hardware regions; 16px gutters prevent mip-edge contamination.
        tile = Image.new("RGB", (SIZE, SIZE), (192, 193, 181))
        d = ImageDraw.Draw(tile)
        d.rectangle((280, 8, 504, 120), fill=(61, 70, 72))
        d.rectangle((280, 248, 504, 504), fill=(47, 57, 60))
        # Two restrained identification plates, separate from quiet trim samples.
        for x, label in [(288, "E-04"), (396, "C-01")]:
            d.rectangle((x, 64, x+100, 112), fill=(61, 70, 72))
            d.rectangle((x+5, 71, x+9, 104), fill=(177, 128, 51))
            d.text((x+18, 76), label, font=font(18), fill=(205, 209, 196))
        # Access cover: one perimeter seam, four fasteners, a latch and a small ID.
        d.rounded_rectangle((24, 280, 264, 488), radius=9, fill=(182, 184, 173), outline=(111, 119, 117), width=2)
        d.line((30, 485, 258, 485), fill=(210, 211, 199), width=2)
        for x in [36, 252]:
            for y in [292, 476]:
                d.ellipse((x-2, y-2, x+2, y+2), fill=(76, 86, 87))
        d.rectangle((228, 362, 244, 398), fill=(77, 86, 87))
        d.rectangle((232, 365, 241, 393), fill=(142, 150, 146))
        d.line((232, 365, 241, 365), fill=(210, 213, 202), width=2)
        d.text((43, 303), "ACCESS  /  01", font=font(12), fill=(83, 94, 94))
        # Louvers belong only to the separately modeled ventilation inset.
        for y in range(288, 481, 12):
            d.rectangle((300, y, 484, y+5), fill=(25, 34, 37))
            d.line((300, y+7, 484, y+7), fill=(91, 103, 103), width=1)
        # Cargo registry retains its own compact readable rectangle.
        d.rectangle((280, 120, 504, 248), fill=(192, 193, 181))
        d.rectangle((300, 148, 307, 221), fill=(177, 128, 51))
        d.text((320, 151), "DW / 014", font=font(20), fill=(53, 66, 68))
        d.text((320, 184), "FREIGHT", font=font(13), fill=(88, 100, 100))
    # Dedicated flat-paint texel for bevels. Never magnify the border/wear crop.
    # Face artwork begins beyond this gutter; keep its decals and panel lines.
    ImageDraw.Draw(tile).rectangle((0, 0, 7, 7), fill=color)
    atlas.paste(tile, ((index % 4)*SIZE, (index // 4)*SIZE))

# One-time planar artwork preparation, packed beside the original atlas.
# Preserve generated seam drawing; normalize its ivory field to vessel paint.
source = Image.open(ROOT / "assets/ships/industrial-kit/dome-source-v1.png").convert("RGB")
source = source.resize((2048, 2048), Image.Resampling.LANCZOS)
# Match the quiet background at the center, without baking directional lighting.
center = source.getpixel((24, 24))
channels = source.split()
source = Image.merge("RGB", tuple(ch.point(lambda v, delta=PALETTE[15][1][i]-center[i]: max(0,min(255,v+delta))) for i,ch in enumerate(channels)))
wide = Image.new("RGB", (4096, 3072), PALETTE[15][1])
wide.paste(atlas, (0, 0))
wide.paste(source, (2048, 0))
# A padded 2048x1024 barrel strip, with a quiet wrap join.
barrel = Image.open(ROOT / "assets/ships/industrial-kit/barrel-source-v1.png").convert("RGB")
base = barrel.getpixel((12, 12))
barrel = Image.merge("RGB", tuple(ch.point(lambda v, delta=PALETTE[15][1][i]-base[i]: max(0,min(255,v+delta))) for i,ch in enumerate(barrel.split())))
barrel = barrel.resize((2048, 1024), Image.Resampling.LANCZOS)
# Blend perimeter to quiet ivory so the wrap and head joins cannot form a hard line.
mask = Image.new("L", barrel.size, 255)
mp = mask.load()
for y in range(1024):
    for x in range(2048):
        mp[x,y] = round(255*min(1, x/32, (2047-x)/32, y/32, (1023-y)/32))
barrel = Image.composite(barrel, Image.new("RGB", barrel.size, PALETTE[15][1]), mask)
wide.paste(barrel, (0, 2048))
atlas = wide

target = ROOT / "assets/ships/industrial-kit/panels.png"
atlas.save(target, optimize=True)
print(target.relative_to(ROOT))
