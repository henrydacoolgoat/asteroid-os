"""Rebuild Asteroid OS One icons with a direct electric-violet tile outline.

The v2 artwork contains the approved glyphs and tile interiors, but its exported
alpha silhouette also includes a wide white bevel.  This script keeps the source
artwork away from the edge, replaces only that bevel, and writes a versioned RGBA
icon set plus a visual QA contact sheet.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ICON_ORDER = (
    "launchpad",
    "finder",
    "messages",
    "shards",
    "freeperiod",
    "mail",
    "asteroidbrowser",
    "comet",
    "maps",
    "photos",
    "camera",
    "notes",
    "calendar",
    "calculator",
    "terminal",
    "settings",
    "appstore",
    "contacts",
    "music",
)


def erode(mask: np.ndarray) -> np.ndarray:
    """Return a one-pixel 8-neighbour erosion without optional dependencies."""
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    height, width = mask.shape
    result = np.ones_like(mask)
    for dy in range(3):
        for dx in range(3):
            result &= padded[dy : dy + height, dx : dx + width]
    return result


def supersampled_polygon(size: int, box: tuple[int, int, int, int]) -> np.ndarray:
    """Create the clean six-sided tile silhouette as an antialiased alpha mask."""
    x0, y0, x1, y1 = box
    cut = round(min(x1 - x0, y1 - y0) * 0.18)
    scale = 4
    points = (
        ((x0 + cut) * scale, y0 * scale),
        (x1 * scale, y0 * scale),
        (x1 * scale, (y1 - cut) * scale),
        ((x1 - cut) * scale, y1 * scale),
        (x0 * scale, y1 * scale),
        (x0 * scale, (y0 + cut) * scale),
    )
    large = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(large).polygon(points, fill=255)
    alpha = large.resize((size, size), Image.Resampling.LANCZOS)
    return np.asarray(alpha)


def refine_icon(source: Image.Image) -> Image.Image:
    """Preserve the glyph/interior and replace the exported bevel at the edge."""
    source = source.convert("RGBA")
    if source.size != (256, 256):
        raise ValueError(f"Expected 256x256 icon, got {source.size}")

    rgba = np.asarray(source).copy()
    old_alpha = rgba[:, :, 3]
    ys, xs = np.nonzero(old_alpha >= 128)
    if not len(xs):
        raise ValueError("Source icon has no opaque pixels")

    # The old bevel is four pixels outside the actual tile on each straight edge.
    # Insetting it yields the blue face itself and removes both white corner wedges.
    box = (int(xs.min()) + 4, int(ys.min()) + 4, int(xs.max()) - 4, int(ys.max()) - 4)
    alpha = supersampled_polygon(256, box)
    solid = alpha >= 128

    # Measure inward distance from the new silhouette. The first 13 pixels are the
    # only pixels repainted; approved app symbols all sit safely inside that zone.
    distance = np.zeros((256, 256), dtype=np.uint8)
    layer = solid.copy()
    for depth in range(1, 18):
        inner = erode(layer)
        distance[layer & ~inner] = depth
        layer = inner
    distance[layer] = 18

    rgb = rgba[:, :, :3]
    original = rgb.copy()
    # Build a local background field from blue-only source pixels. White glyph and
    # bevel pixels are deliberately not seeds, so their light values cannot leak
    # into the replacement edge. Repeated 8-neighbour expansion retains the nearby
    # face gradient and shadow while reaching every point around the silhouette.
    red = original[:, :, 0].astype(np.int16)
    green = original[:, :, 1].astype(np.int16)
    blue = original[:, :, 2].astype(np.int16)
    seeds = solid & (distance >= 14) & (blue > red + 8) & (blue > green + 12)
    known = seeds.copy()
    background = original.astype(np.float32)
    for _ in range(80):
        if np.all(known[solid]):
            break
        padded_known = np.pad(known, 1, mode="constant", constant_values=False)
        padded_rgb = np.pad(background, ((1, 1), (1, 1), (0, 0)), mode="edge")
        count = np.zeros((256, 256), dtype=np.float32)
        total = np.zeros((256, 256, 3), dtype=np.float32)
        for dy in range(3):
            for dx in range(3):
                if dx == 1 and dy == 1:
                    continue
                neighbour_known = padded_known[dy : dy + 256, dx : dx + 256]
                count += neighbour_known
                total += padded_rgb[dy : dy + 256, dx : dx + 256] * neighbour_known[:, :, None]
        fill = solid & ~known & (count > 0)
        background[fill] = total[fill] / count[fill, None]
        known[fill] = True

    if not np.all(known[solid]):
        raise RuntimeError("Could not reconstruct the complete tile-edge background")

    # Repaint only the old bevel zone from the reconstructed local face.
    edge_zone = solid & (distance <= 13)
    rgb[edge_zone] = np.rint(background[edge_zone]).astype(np.uint8)

    # A compact 3px line follows the silhouette directly. It replaces the thick
    # white band without changing the face, glyph, or glow supplied by the UI.
    outline = solid & (distance <= 3)
    oy, ox = np.nonzero(outline)
    vertical = (oy - box[1]) / max(1, box[3] - box[1])
    top = np.array([174, 142, 255], dtype=np.float32)
    bottom = np.array([100, 69, 255], dtype=np.float32)
    color = np.rint(top[None, :] * (1 - vertical[:, None]) + bottom[None, :] * vertical[:, None])
    rgb[oy, ox] = color.astype(np.uint8)

    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def make_contact_sheet(icon_dir: Path, destination: Path) -> None:
    width, height = 1448, 1086
    sheet = Image.new("RGB", (width, height), (8, 7, 19))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
    except OSError:
        font = ImageFont.load_default()

    centers = (
        (208, 155), (477, 155), (746, 155), (1014, 155), (1283, 155),
        (208, 425), (477, 425), (746, 425), (1014, 425), (1283, 425),
        (208, 695), (477, 695), (746, 695), (1014, 695), (1283, 695),
        (323, 955), (592, 955), (861, 955), (1130, 955),
    )
    for name, (cx, cy) in zip(ICON_ORDER, centers):
        icon = Image.open(icon_dir / f"{name}.png").convert("RGBA")
        sheet.paste(icon, (cx - 128, cy - 128), icon)
        label = name.replace("asteroidbrowser", "Asteroid Browser").replace("freeperiod", "FreePeriod")
        if label not in ("Asteroid Browser", "FreePeriod"):
            label = label.capitalize()
        bounds = draw.textbbox((0, 0), label, font=font)
        text_width = bounds[2] - bounds[0]
        draw.text((cx - text_width / 2, cy + 126), label, fill=(228, 224, 244), font=font)

    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("qa_sheet", type=Path)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    for name in ICON_ORDER:
        source_path = args.source / f"{name}.png"
        destination = args.output / f"{name}.png"
        refined = refine_icon(Image.open(source_path))
        refined.save(destination, format="PNG", optimize=True)
        alpha = np.asarray(refined.getchannel("A"))
        if alpha[0, 0] or alpha[-1, -1] or alpha.max() != 255 or alpha.min() != 0:
            raise RuntimeError(f"{name} did not produce a valid transparent RGBA icon")
        print(f"{name:16} -> {destination}")

    make_contact_sheet(args.output, args.qa_sheet)
    print(f"QA sheet         -> {args.qa_sheet}")


if __name__ == "__main__":
    main()
