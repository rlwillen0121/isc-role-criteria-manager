#!/usr/bin/env python3
"""
make-gifs.py — assemble docs/media/ screenshots into annotated GIFs.

Reads docs/media/_gif-manifest.json and writes one GIF per group.
Requires: Pillow (pip install Pillow)

Usage:
    python3 scripts/make-gifs.py
"""

import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install Pillow --break-system-packages", file=sys.stderr)
    sys.exit(1)

ROOT      = Path(__file__).parent.parent
MEDIA_DIR = ROOT / "docs" / "media"
MANIFEST  = MEDIA_DIR / "_gif-manifest.json"

# GIF settings
MAX_WIDTH  = 1024   # px — keeps file sizes reasonable for GitHub
FPS_DELAY  = 200    # centiseconds per frame (200 = 2s)
LOOP       = 0      # 0 = loop forever


def resize_frame(img: Image.Image, max_w: int = MAX_WIDTH) -> Image.Image:
    """Scale down proportionally if wider than max_w. Always returns RGB."""
    img = img.convert("RGB")
    w, h = img.size
    if w > max_w:
        ratio = max_w / w
        img = img.resize((max_w, int(h * ratio)), Image.LANCZOS)
    return img


def make_gif(name: str, paths: list[str]) -> Path | None:
    if not paths:
        print(f"  [{name}] no frames — skipped")
        return None

    frames: list[Image.Image] = []
    for p in paths:
        if not os.path.exists(p):
            print(f"  [{name}] missing: {p}", file=sys.stderr)
            continue
        frames.append(resize_frame(Image.open(p)))

    if not frames:
        print(f"  [{name}] all frames missing — skipped")
        return None

    out = MEDIA_DIR / f"{name}.gif"
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        optimize=True,
        duration=FPS_DELAY * 10,  # Pillow duration is in ms; centiseconds × 10 = ms
        loop=LOOP,
        format="GIF",
    )
    size_kb = out.stat().st_size // 1024
    print(f"  [{name}] {len(frames)} frames → {out.name}  ({size_kb} KB)")
    if size_kb > 10240:
        print(f"  ⚠️  {out.name} is >10 MB — consider reducing frame count or MAX_WIDTH")
    return out


def main() -> None:
    if not MANIFEST.exists():
        print(f"ERROR: manifest not found: {MANIFEST}", file=sys.stderr)
        sys.exit(1)

    with open(MANIFEST) as fh:
        manifest: dict[str, list[str]] = json.load(fh)

    print(f"Making GIFs from {len(manifest)} groups...")
    results: list[Path] = []
    for group_name, frame_paths in manifest.items():
        gif = make_gif(group_name, frame_paths)
        if gif:
            results.append(gif)

    print(f"\n✅ {len(results)} GIF(s) written to {MEDIA_DIR}")
    for r in results:
        print(f"   {r.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
