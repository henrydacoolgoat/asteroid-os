"""Build the Asteroid OS One per-app RGBA icon set from the remade atlas.

The image generator can return a visually transparent checkerboard as RGB pixels.
This deterministic packaging step keeps the complete blue tile and white glyph,
applies an antialiased alpha edge to the tile silhouette, and emits one 256px PNG
per application so the browser never has to crop a sprite window.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ICON_CENTERS = (
    ("launchpad", 208, 173),
    ("finder", 477, 173),
    ("messages", 746, 173),
    ("shards", 1014, 173),
    ("freeperiod", 1283, 173),
    ("mail", 208, 444),
    ("asteroidbrowser", 477, 444),
    ("comet", 746, 444),
    ("maps", 1014, 444),
    ("photos", 1283, 444),
    ("camera", 208, 715),
    ("notes", 477, 715),
    ("calendar", 746, 715),
    ("calculator", 1014, 715),
    ("terminal", 1283, 715),
    ("settings", 323, 965),
    ("appstore", 592, 965),
    ("contacts", 861, 965),
    ("music", 1130, 965),
)


def detected_tile_box(rgb: np.ndarray) -> tuple[int, int, int, int]:
    """Find the physical blue tile while ignoring its glow and pale backdrop."""
    red = rgb[:, :, 0].astype(np.int16)
    green = rgb[:, :, 1].astype(np.int16)
    blue = rgb[:, :, 2].astype(np.int16)
    luminance = (red + green + blue) / 3
    core = (blue - red > 12) & (blue - green > 22) & (luminance < 205)

    row_counts = core.sum(axis=1)
    col_counts = core.sum(axis=0)
    ys = np.flatnonzero(row_counts >= 24)
    xs = np.flatnonzero(col_counts >= 24)
    if not len(xs) or not len(ys):
        raise RuntimeError("Could not locate the blue application tile")

    # The generated set is intentionally uniform. A small outward allowance keeps
    # the bright edge highlight while excluding the checkerboard pixels.
    x0 = max(0, int(xs[0]) - 2)
    y0 = max(0, int(ys[0]) - 2)
    x1 = min(rgb.shape[1] - 1, int(xs[-1]) + 2)
    y1 = min(rgb.shape[0] - 1, int(ys[-1]) + 2)
    return x0, y0, x1, y1


def tile_alpha(size: tuple[int, int], box: tuple[int, int, int, int]) -> Image.Image:
    """Return a supersampled alpha mask for the two-cut-corner tile shape."""
    width, height = size
    x0, y0, x1, y1 = box
    cut = max(20, round(min(x1 - x0, y1 - y0) * 0.18))
    scale = 4
    points = (
        ((x0 + cut) * scale, y0 * scale),
        (x1 * scale, y0 * scale),
        (x1 * scale, (y1 - cut) * scale),
        ((x1 - cut) * scale, y1 * scale),
        (x0 * scale, y1 * scale),
        (x0 * scale, (y0 + cut) * scale),
    )
    large = Image.new("L", (width * scale, height * scale), 0)
    ImageDraw.Draw(large).polygon(points, fill=255)
    return large.resize((width, height), Image.Resampling.LANCZOS)


def build_icon(atlas: Image.Image, center: tuple[int, int]) -> tuple[Image.Image, tuple[int, int, int, int]]:
    crop_radius = 124
    cx, cy = center
    crop = atlas.crop((cx - crop_radius, cy - crop_radius, cx + crop_radius, cy + crop_radius)).convert("RGB")
    rgb = np.asarray(crop)
    box = detected_tile_box(rgb)
    alpha = tile_alpha(crop.size, box)
    rgba = crop.convert("RGBA")
    rgba.putalpha(alpha)

    x0, y0, x1, y1 = box
    content = rgba.crop((max(0, x0 - 2), max(0, y0 - 2), min(rgba.width, x1 + 3), min(rgba.height, y1 + 3)))
    content.thumbnail((232, 232), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    output.alpha_composite(content, ((256 - content.width) // 2, (256 - content.height) // 2))
    return output, box


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    atlas = Image.open(args.source).convert("RGB")
    if atlas.size != (1448, 1086):
        raise SystemExit(f"Expected a 1448x1086 atlas, got {atlas.size[0]}x{atlas.size[1]}")

    args.output.mkdir(parents=True, exist_ok=True)
    for name, cx, cy in ICON_CENTERS:
        icon, box = build_icon(atlas, (cx, cy))
        destination = args.output / f"{name}.png"
        icon.save(destination, format="PNG", optimize=True)
        alpha = np.asarray(icon.getchannel("A"))
        if alpha[0, 0] or alpha[-1, -1] or alpha.max() != 255 or alpha.min() != 0:
            raise RuntimeError(f"{name} did not produce a valid transparent RGBA icon")
        print(f"{name:16} {box} -> {destination}")


if __name__ == "__main__":
    main()
