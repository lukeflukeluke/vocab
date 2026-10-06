"""Draws the app icons (a ladder on indigo) into public/.

Same drawing as public/favicon.svg and src/lib/Logo.svelte. The PNGs are full-bleed
squares: iOS and Android round the corners themselves. The ladder sits inside the
maskable safe zone (the central circle, 80% of the width), so one drawing serves both
the normal and the maskable icon.

Run from the repo root:  python3 scripts/make_icons.py   (needs Pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw

BACKGROUND = "#312e81"
RAIL = "#c7d2fe"
TOP_RUNG = "#fbbf24"

# (x, y, width, height, radius, colour) on a 512 x 512 canvas.
SHAPES = [
    (168, 112, 40, 288, 20, RAIL),
    (304, 112, 40, 288, 20, RAIL),
    (168, 324, 176, 32, 16, RAIL),
    (168, 240, 176, 32, 16, RAIL),
    (168, 156, 176, 32, 16, TOP_RUNG),
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
    for x, y, w, h, r, colour in SHAPES:
        box = [x * scale, y * scale, (x + w) * scale, (y + h) * scale]
        pen.rounded_rectangle(box, radius=r * scale, fill=colour)
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
