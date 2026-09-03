#!/usr/bin/env python3
"""Recover a clean transparent mark + wordmark from the Synapsys Note artwork.

The source plate has its transparency flattened onto the classic grey
checkerboard, and the export left a faint white halo underneath the artwork — so
every hole in the logo (the leaf, the gaps between the brain strokes, the
counters of the letters) reads as a washed-out checkerboard rather than as clean
transparency. Thresholding on colour alone punches that same grid through the
artwork, which is plainly visible once the mark sits on a dark canvas. The tile
grid is also irregular (the plate was resampled), so no global phase model stays
aligned across the image.

The backdrop is therefore removed per *region*:

1. Light pixels reachable from the image border are the outer backdrop and
   become fully transparent, with the anti-aliased rim un-composited against
   the measured tile grey so strokes keep clean edges.
2. Light pixels enclosed by artwork are examined one connected region at a time.
   A region that is achromatic *and* still oscillates at a good fraction of the
   tile contrast is backdrop showing through a hole, and becomes transparent.
   Everything else is paint — the pen highlight, the orange synapse cores — and
   is left exactly as drawn.

Because the classification is per region rather than per pixel, it never depends
on knowing where a tile boundary falls, which is what made the naive approaches
leave a grid behind.

Colours, lettering and the symbol are unchanged; only the lockup geometry
changes later, in CSS.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = Path("/workspace/assets/b45fca4a-7c5a-4a19-aef5-3414ef2b6d14.jpg")
OUT = Path("/workspace/public/brand")

# Luma above which a pixel may be backdrop rather than paint. Low enough to
# catch letter counters darkened by JPEG bleed from the navy around them.
LIGHT_LUMA = 145.0
# Enclosed regions below this size are stroke nicks and node cores: always paint.
MIN_REGION_PX = 140
# A region must be this achromatic to be considered backdrop.
MAX_REGION_CHROMA = 24.0
# ...and must retain this share of the tile contrast, proving the checkerboard
# is really showing through instead of the region being flat paint.
MIN_TILE_CONTRAST = 0.40


def luma_of(rgb: np.ndarray) -> np.ndarray:
    return 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]


def spread(values: np.ndarray) -> float:
    """Half the robust peak-to-peak swing of a sample.

    Phase-free by construction, which is the point: the tile grid in this plate
    is irregular, so nothing may depend on tile alignment. Percentiles rather
    than min/max keep JPEG ringing from inflating the estimate.
    """
    if values.size == 0:
        return 0.0
    high, low = np.percentile(values, [90.0, 10.0])
    return float(high - low) / 2.0


def unmatte(rgb: np.ndarray) -> np.ndarray:
    luma = luma_of(rgb)
    height, width = luma.shape

    # The border ring is guaranteed backdrop: it calibrates the tile grey and
    # the tile contrast every other measurement is expressed in.
    ring = np.zeros((height, width), dtype=bool)
    ring[:8, :] = ring[-8:, :] = True
    ring[:, :8] = ring[:, -8:] = True
    tile_grey = np.array([rgb[:, :, i][ring].mean() for i in range(3)], dtype=np.float32)
    tile_contrast = spread(luma[ring])

    light = luma > LIGHT_LUMA
    labels, region_count = ndimage.label(light)
    border_labels = set(
        np.unique(np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]))
    )

    alpha = np.ones((height, width), dtype=np.float32)
    backdrop = np.isin(labels, [label for label in border_labels if label > 0])
    alpha[backdrop] = 0.0

    holes = 0
    for index, box in enumerate(ndimage.find_objects(labels), start=1):
        if index in border_labels or box is None:
            continue
        region = labels[box] == index
        if region.sum() < MIN_REGION_PX:
            continue

        # Erode first: the outermost pixels blend into the ink around them and
        # would distort both statistics.
        core = ndimage.binary_erosion(region, iterations=2)
        sample = core if core.any() else region

        median = np.array(
            [float(np.median(rgb[box][:, :, i][sample])) for i in range(3)], dtype=np.float32
        )
        achromatic = float(median.max() - median.min()) < MAX_REGION_CHROMA
        oscillating = spread(luma[box][sample]) >= MIN_TILE_CONTRAST * tile_contrast

        if achromatic and oscillating:
            alpha[box][region] = 0.0
            holes += 1

    # Anti-aliased rim: coverage tracks how far a pixel has moved away from the
    # tile grey, which is exactly what partial compositing produces.
    transparent = alpha < 0.5
    distance = np.sqrt(((rgb - tile_grey) ** 2).sum(axis=2))
    rim = ndimage.binary_dilation(transparent, iterations=3) & ~transparent
    alpha[rim] = np.minimum(alpha[rim], np.clip(distance[rim] / 130.0, 0.0, 1.0))

    out = np.empty((height, width, 4), dtype=np.uint8)
    denom = np.maximum(alpha, 1e-3)
    for i in range(3):
        recovered = (rgb[:, :, i] - tile_grey[i] * (1.0 - alpha)) / denom
        out[:, :, i] = np.clip(recovered, 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)

    print(
        f"regions={region_count} holes={holes} "
        f"tile_grey={tile_grey.round(1).tolist()} tile_contrast={tile_contrast:.1f}"
    )
    return out


def tight_crop(rgba: np.ndarray, pad: int = 8) -> np.ndarray:
    ys, xs = np.where(rgba[:, :, 3] > 140)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1 = min(rgba.shape[0], y1 + pad)
    x1 = min(rgba.shape[1], x1 + pad)
    return rgba[y0:y1, x0:x1]


def save_png(arr: np.ndarray, path: Path, max_side: int | None = None) -> None:
    im = Image.fromarray(arr, "RGBA")
    if max_side:
        scale = max_side / max(im.size)
        if scale < 1:
            im = im.resize(
                (round(im.width * scale), round(im.height * scale)),
                Image.Resampling.LANCZOS,
            )
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print(f"wrote {path} {im.size}")


def split_row(rgba: np.ndarray) -> int:
    """Finds the blank band between the symbol and the stacked lettering."""
    ink = (rgba[:, :, 3] > 140).mean(axis=1)
    lo, hi = int(len(ink) * 0.45), int(len(ink) * 0.85)

    best_len, best_mid, run_start = 0, (lo + hi) // 2, None
    for y in range(lo, hi):
        if ink[y] < 0.002:
            run_start = y if run_start is None else run_start
        elif run_start is not None:
            if y - run_start > best_len:
                best_len, best_mid = y - run_start, (run_start + y) // 2
            run_start = None
    if run_start is not None and hi - run_start > best_len:
        best_mid = (run_start + hi) // 2
    return best_mid


def main() -> None:
    rgba = unmatte(np.array(Image.open(SRC).convert("RGB"), dtype=np.float32))
    split = split_row(rgba)

    save_png(tight_crop(rgba), OUT / "synapsys-note-logo.png", 1400)
    mark = tight_crop(rgba[:split])
    save_png(mark, OUT / "synapsys-mark.png", 720)
    save_png(tight_crop(rgba[split:]), OUT / "synapsys-wordmark.png", 900)

    mark_im = Image.fromarray(mark, "RGBA")
    for size, name in (
        (64, "synapsys-mark-64.png"),
        (192, "synapsys-mark-192.png"),
        (512, "synapsys-mark-512.png"),
    ):
        mark_im.resize(
            (size, round(size * mark_im.height / mark_im.width)),
            Image.Resampling.LANCZOS,
        ).save(OUT / name, "PNG", optimize=True)
        print(f"wrote {OUT / name}")

    print("split_y", split, "mark", mark.shape)


if __name__ == "__main__":
    main()
