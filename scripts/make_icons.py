"""生成扩展图标（16/32/48/128），千苍主题配色。

用法：python scripts/make_icons.py
仅在图标需要重新生成时运行；产物提交进仓库，日常构建不需要 Python。

设计：苍青圆角方块 + 白色书签剪影（下方带 V 形缺口）。
先按 4 倍尺寸绘制再缩小，避免小尺寸锯齿。
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "icons"
SIZES = (16, 32, 48, 128)
SCALE = 4
BG = (74, 96, 94, 255)      # 苍青 #4A605E
FG = (255, 255, 255, 255)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_icon(size):
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 底板：留 6% 边距，圆角 22%
    pad = round(s * 0.06)
    rounded_rect(d, (pad, pad, s - pad, s - pad), round(s * 0.22), BG)

    # 书签剪影
    w = round(s * 0.34)
    h = round(s * 0.46)
    x0 = (s - w) // 2
    y0 = (s - h) // 2
    x1 = x0 + w
    y1 = y0 + h
    notch = round(h * 0.22)
    cx = x0 + w // 2
    d.polygon(
        [(x0, y0), (x1, y0), (x1, y1), (cx, y1 - notch), (x0, y1)],
        fill=FG,
    )

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        draw_icon(size).save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)}")
    print("icons ok")


if __name__ == "__main__":
    main()
