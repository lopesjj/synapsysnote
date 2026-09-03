#!/usr/bin/env python3
"""Split the attached Synapsys Note artwork into transparent mark + wordmark.

Only the lockup geometry changes later in CSS (mark left, original stacked
wordmark right). Colors, lettering and the symbol are kept as-is.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path("/home/ubuntu/.cursor/projects/workspace/assets/6b275de4-433f-4b8d-8c96-596cb28f87d8.png")
OUT = Path("/workspace/public/brand")


def matte() -> tuple[np.ndarray, np.ndarray]:
    rgb = np.array(Image.open(SRC).convert("RGB"), dtype=np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    luma = 0.299 * r + 0.587 * g + 0.114 * b

    # Checkerboard tiles (~179 / ~207) plus the near-white halo around the art.
    # Keep tinted pixels (leaf glow, teal veins, navy type, orange synapses).
    bg = (chroma < 14) & (luma >= 158)
    edge = (chroma < 24) & (luma >= 140) & ~bg
    alpha = np.ones(luma.shape, dtype=np.float32)
    alpha[bg] = 0.0
    alpha[edge] = np.clip((chroma[edge] - 3.0) / 20.0, 0.0, 1.0)

    bg_est = 193.0
    out = np.empty((*rgb.shape[:2], 4), dtype=np.uint8)
    denom = np.maximum(alpha, 1e-4)
    for i in range(3):
        recovered = (rgb[:, :, i] - bg_est * (1.0 - alpha)) / denom
        out[:, :, i] = np.clip(recovered, 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    return rgb, out


def tight_crop(rgba: np.ndarray, pad: int = 12) -> np.ndarray:
    ys, xs = np.where(rgba[:, :, 3] > 12)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0 = max(0, y0 - pad)
    x0 = max(0, x0 - pad)
    y1 = min(rgba.shape[0], y1 + pad)
    x1 = min(rgba.shape[1], x1 + pad)
    return rgba[y0:y1, x0:x1]


def save_png(arr: np.ndarray, path: Path, max_side: int | None = None) -> None:
    im = Image.fromarray(arr, "RGBA")
    if max_side:
        scale = max_side / max(im.size)
        if scale < 1:
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print(f"wrote {path} {im.size}")


def row_alpha(rgba: np.ndarray) -> np.ndarray:
    return rgba[:, :, 3].mean(axis=1)


def main() -> None:
    _, rgba = matte()
    alpha_rows = row_alpha(rgba)
    # Wordmark starts where the stacked “Synapsys” lettering densifies.
    split = int(np.argmax(alpha_rows[1000:1120] > (alpha_rows[900:1000].mean() * 1.35)) + 1000)
    # Prefer the first sustained jump after the mark (empirical: ~1048–1088).
    for y in range(1020, 1120):
        if alpha_rows[y] > 0.35 and alpha_rows[y - 8] < 0.30:
            split = y - 4
            break

    mark = tight_crop(rgba[:split])
    word = tight_crop(rgba[split:])
    full = tight_crop(rgba)

    save_png(full, OUT / "synapsys-note-logo.png", 1400)
    save_png(mark, OUT / "synapsys-mark.png", 720)
    save_png(word, OUT / "synapsys-wordmark.png", 900)

    mark_im = Image.fromarray(mark, "RGBA")
    mark_im.resize((64, round(64 * mark_im.height / mark_im.width)), Image.Resampling.LANCZOS).save(
        OUT / "synapsys-mark-64.png", "PNG", optimize=True
    )
    print("split_y", split, "mark", mark.shape, "word", word.shape)


if __name__ == "__main__":
    main()
