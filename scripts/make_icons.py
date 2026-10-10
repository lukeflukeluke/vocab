"""Draws the app icons (Wordhoard's gold gem on ink) into public/.

Same drawing as public/favicon.svg and src/lib/Logo.svelte. The PNGs are full-bleed
squares: iOS and Android round the corners themselves. The gem sits inside the maskable
safe zone (the central circle, 80% of the width), so one drawing serves both the normal
and the maskable icon.

Run from the repo root:  python3 scripts/make_icons.py   (needs Pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw

BACKGROUND = "#1b2240"

# Facets of the gem, then a sparkle: (points, colour) on a 512 x 512 canvas.
SHAPES = [
    ([(136, 200), (196, 136), (216, 200)], "#f6cf6a"),
    ([(196, 136), (316, 136), (296, 200), (216, 200)], "#fbe3a0"),
    ([(316, 136), (376, 200), (296, 200)], "#e8b143"),
    ([(136, 200), (216, 200), (256, 388)], "#e6a730"),
    ([(216, 200), (296, 200), (256, 388)], "#f2bd4b"),
    ([(296, 200), (376, 200), (256, 388)], "#c98a1c"),
    (
        [(380, 96), (388, 120), (412, 128), (388, 136), (380, 160), (372, 136), (348, 128), (372, 120)],
        "#fff3d1",
    ),
]

SUPERSAMPLE = 4
OUTPUTS = {
    "public/icons/icon-192.png": 192,
    "public/icons/icon-512.png": 512,
    "public/icons/icon-maskable-512.png": 512,
    "public/apple-touch-icon.png": 180,
}


def draw(size: int) -> Image.Image:
    big = size * SUPERSAMPLE
    scale = big / 512
    image = Image.new("RGB", (big, big), BACKGROUND)
    pen = ImageDraw.Draw(image)
    for points, colour in SHAPES:
        pen.polygon([(x * scale, y * scale) for x, y in points], fill=colour)
    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    for relative, size in OUTPUTS.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        draw(size).save(path, optimize=True)
        print(f"wrote {relative} ({size}px)")


if __name__ == "__main__":
    main()
