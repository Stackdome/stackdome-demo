#!/usr/bin/env python3
"""mir-diff.py <original.png> <rebuild.png> <diff.png>

Scores how closely the rebuild matches the original, 0 to 100, and says where it differs.
Both images are placed top-left on a shared white canvas, so a size difference costs score.
A light blur and a tolerance keep font anti-aliasing from counting as a mismatch.
Empty background is not counted: only pixels that carry content in either image can match,
so a blank rebuild of a mostly blank original scores near 0, not near 100.
"""
import sys

from PIL import Image, ImageChops, ImageFilter

TOLERANCE = 40  # per-channel difference below this is the same pixel to a human eye
GRID = 3


def on_canvas(image, size):
    canvas = Image.new("RGB", size, "white")
    canvas.paste(image.convert("RGB"), (0, 0))
    return canvas


def runs(flags, gap):
    """Index ranges where flags are set, merging ranges closer than `gap`."""
    out, start, last = [], None, None
    for index, flag in enumerate(flags):
        if not flag:
            continue
        if start is None:
            start = index
        elif index - last > gap:
            out.append((start, last))
            start = index
        last = index
    if start is not None:
        out.append((start, last))
    return out


def boxes(wrong, a, b, limit=6):
    """The largest mismatched areas as exact boxes, with the average colour on each side."""
    width, height = wrong.size
    found = []
    for top, bottom in runs([wrong.crop((0, y, width, y + 1)).getbbox() is not None for y in range(height)], gap=10):
        band = wrong.crop((0, top, width, bottom + 1))
        for left, right in runs([band.crop((x, 0, x + 1, band.height)).getbbox() is not None for x in range(width)], gap=24):
            box = (left, top, right + 1, bottom + 1)
            count = wrong.crop(box).histogram()[255]
            if count >= 40:
                found.append((count, box))
    lines = []
    for count, box in sorted(found, reverse=True)[:limit]:
        mean = lambda image: "#%02x%02x%02x" % tuple(int(sum(c) / len(c)) for c in zip(*image.crop(box).resize((8, 8)).getdata()))
        lines.append(f"BOX x={box[0]} y={box[1]} w={box[2] - box[0]} h={box[3] - box[1]}: {count} px differ, average colour original {mean(a)} rebuild {mean(b)}")
    return lines


def main(original_path, rebuild_path, diff_path):
    original, rebuild = Image.open(original_path), Image.open(rebuild_path)
    size = (max(original.width, rebuild.width), max(original.height, rebuild.height))
    a, b = on_canvas(original, size), on_canvas(rebuild, size)

    blur = ImageFilter.GaussianBlur(1.2)
    delta = ImageChops.difference(a.filter(blur), b.filter(blur)).convert("L")
    wrong = delta.point(lambda v: 255 if v > TOLERANCE else 0)

    background = Image.new("RGB", size, max(a.getcolors(size[0] * size[1]), key=lambda c: c[0])[1])
    content = ImageChops.lighter(
        ImageChops.difference(a, background).convert("L"), ImageChops.difference(b, background).convert("L")
    ).point(lambda v: 255 if v > TOLERANCE else 0)
    counted = ImageChops.lighter(content, wrong).histogram()[255]
    score = 100 * (1 - wrong.histogram()[255] / max(1, counted))

    # The diff image: the original, faded, with mismatched pixels in red.
    faded = Image.blend(a, Image.new("RGB", size, "white"), 0.65)
    faded.paste(Image.new("RGB", size, (230, 40, 30)), mask=wrong)
    faded.save(diff_path)

    print(f"SCORE {score:.1f}")
    print(f"SIZE original={original.width}x{original.height} rebuild={rebuild.width}x{rebuild.height}")
    for line in boxes(wrong, a, b):
        print(line)
    rows, cols = ["top", "middle", "bottom"], ["left", "centre", "right"]
    cells = []
    for r in range(GRID):
        for c in range(GRID):
            box = (c * size[0] // GRID, r * size[1] // GRID, (c + 1) * size[0] // GRID, (r + 1) * size[1] // GRID)
            cell = wrong.crop(box)
            share = 100 * cell.histogram()[255] / max(1, cell.width * cell.height)
            cells.append((share, f"{rows[r]}-{cols[c]}"))
    for share, name in sorted(cells, reverse=True)[:3]:
        if share >= 1:
            print(f"REGION {name} {share:.0f}% different")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: mir-diff.py <original.png> <rebuild.png> <diff.png>")
    main(*sys.argv[1:])
