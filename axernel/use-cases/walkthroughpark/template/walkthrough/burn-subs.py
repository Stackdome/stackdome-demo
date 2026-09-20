#!/usr/bin/env python3
"""Burn SRT subtitles into MP4 without libass: render each cue as a transparent
PNG (PIL) and chain ffmpeg overlay filters with enable=between(t,..) windows.
Usage: python3 burn-subs.py <name>   # expects videos/<name>.mp4 + videos/<name>.srt
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

name = sys.argv[1]
video = Path(f"videos/{name}.mp4")
srt = Path(f"videos/{name}.srt")
out = Path(f"videos/{name}-subbed.mp4")

FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
MAX_W = 1100  # wrap width in px
PAD_X, PAD_Y, RADIUS = 20, 11, 9


def parse_ts(ts: str) -> float:
    h, m, rest = ts.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def split_sentences(text: str) -> list[str]:
    # sentence-level chunks; long ones split again at an em-dash or comma near the middle
    parts = re.split(r"(?<=[.!?…])\s+", text)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        while len(p) > 110:
            cut = -1
            for sep in [" — ", ", "]:
                candidates = [m.start() for m in re.finditer(re.escape(sep), p) if 40 < m.start() < len(p) - 30]
                if candidates:
                    cut = min(candidates, key=lambda i: abs(i - len(p) // 2))
                    out.append(p[: cut + (0 if sep == " — " else 1)].strip())
                    p = p[cut + len(sep) - (1 if sep == ", " else 0) :].strip()
                    break
            else:
                break
            continue
        out.append(p)
    return out


# scene-level SRT cues → sentence-level cues, window split proportionally by length
cues = []
for block in re.split(r"\n\s*\n", srt.read_text().strip()):
    lines = [l for l in block.splitlines() if l.strip()]
    if len(lines) < 2:
        continue
    m = re.match(r"([\d:,]+)\s*-->\s*([\d:,]+)", lines[1])
    if not m:
        continue
    text = " ".join(lines[2:]).strip()
    if not text:
        continue
    start, end = parse_ts(m.group(1)), parse_ts(m.group(2))
    sentences = split_sentences(text)
    total = sum(len(s) for s in sentences) or 1
    t = start
    for s in sentences:
        dur = (end - start) * len(s) / total
        cues.append((t, min(t + dur - 0.05, end), s))
        t += dur

tmp = Path(tempfile.mkdtemp(prefix="subs-"))
draw_probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))


def wrap(text: str) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw_probe.textlength(trial, font=FONT) > MAX_W and cur:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


pngs = []
for i, (start, end, text) in enumerate(cues):
    lines = wrap(text)
    line_h = 32
    w = int(max(draw_probe.textlength(l, font=FONT) for l in lines)) + PAD_X * 2
    h = line_h * len(lines) + PAD_Y * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=RADIUS, fill=(10, 10, 10, 190))
    for j, l in enumerate(lines):
        lw = d.textlength(l, font=FONT)
        d.text(((w - lw) / 2, PAD_Y + j * line_h + 2), l, font=FONT, fill=(255, 255, 255, 255))
    p = tmp / f"cue{i:03d}.png"
    img.save(p)
    pngs.append(p)

# build ffmpeg overlay chain
inputs, filters = [], []
prev = "0:v"
for i, ((start, end, _), p) in enumerate(zip(cues, pngs)):
    inputs += ["-i", str(p)]
    label = f"v{i}"
    filters.append(
        f"[{prev}][{i + 1}:v]overlay=(W-w)/2:H-h-48:enable='between(t,{start:.3f},{end:.3f})'[{label}]"
    )
    prev = label

cmd = (
    ["ffmpeg", "-i", str(video)]
    + inputs
    + ["-filter_complex", ";".join(filters), "-map", f"[{prev}]", "-map", "0:a"]
    + ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", "-y", str(out)]
)
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-1500:])
    sys.exit(1)
print(f"{out} ok — {len(cues)} cues burned")
