#!/usr/bin/env python3
import json
import os
import sys

import numpy as np
from PIL import Image, ImageOps

DEFAULT_FRAME_ASPECT_RATIO = 2.45
DEFAULT_OFFSET_LIMIT = 45


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def smooth_1d(values, window):
    if window <= 1 or values.size == 0:
        return values
    if window % 2 == 0:
        window += 1
    kernel = np.ones(window, dtype=np.float32) / float(window)
    return np.convolve(values, kernel, mode="same")


def estimate_salient_y(gray_image):
    gray = gray_image.astype(np.float32) / 255.0
    if gray.ndim != 2:
        return 0.5

    height, width = gray.shape
    if height < 4 or width < 4:
        return 0.5

    grad_x = np.zeros_like(gray)
    grad_y = np.zeros_like(gray)
    grad_x[:, 1:-1] = np.abs(gray[:, 2:] - gray[:, :-2]) * 0.5
    grad_y[1:-1, :] = np.abs(gray[2:, :] - gray[:-2, :]) * 0.5
    edge_energy = grad_x + grad_y

    col_axis = np.linspace(-1.0, 1.0, width, dtype=np.float32)
    col_prior = np.exp(-0.5 * (col_axis / 0.85) ** 2)
    row_edge = (edge_energy * col_prior[None, :]).mean(axis=1)

    row_luma = gray.mean(axis=1)
    row_luma_delta = np.zeros_like(row_luma)
    row_luma_delta[1:-1] = np.abs(row_luma[2:] - row_luma[:-2]) * 0.5

    combined = 0.82 * row_edge + 0.18 * row_luma_delta
    row_axis = np.linspace(0.0, 1.0, height, dtype=np.float32)
    center_prior = np.exp(-0.5 * ((row_axis - 0.52) / 0.3) ** 2)
    score = combined * center_prior

    smooth_window = max(5, int(height * 0.05))
    score = smooth_1d(score, smooth_window)
    if not np.isfinite(score).any() or np.max(score) <= 1e-8:
        return 0.5

    peak_index = int(np.argmax(score))
    peak_y = float(peak_index / max(height - 1, 1))

    threshold = np.percentile(score, 90)
    mask = score >= threshold
    if np.any(mask):
        centroid = float(np.sum(row_axis[mask] * score[mask]) / (np.sum(score[mask]) + 1e-8))
        return float((peak_y * 0.5) + (centroid * 0.5))

    return peak_y


def to_object_position_offset(y_center, width, height, frame_aspect_ratio, offset_limit):
    if width <= 0 or height <= 0:
        return 0

    image_aspect = float(width) / float(height)
    if image_aspect >= frame_aspect_ratio * 0.995:
        return 0

    displayed_height_ratio = frame_aspect_ratio / image_aspect
    overflow = displayed_height_ratio - 1.0
    if overflow <= 1e-6:
        return 0

    position = ((y_center * displayed_height_ratio) - 0.5) / overflow
    position = clamp(position, 0.0, 1.0)
    offset = (position - 0.5) * 100.0
    return int(round(clamp(offset, -offset_limit, offset_limit)))


def estimate_offset_for_image(image_path, frame_aspect_ratio, offset_limit):
    with Image.open(image_path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        original_width, original_height = image.size

        max_dim = 800
        if max(original_width, original_height) > max_dim:
            scale = float(max_dim) / float(max(original_width, original_height))
            resized = (
                max(1, int(round(original_width * scale))),
                max(1, int(round(original_height * scale))),
            )
            image = image.resize(resized, Image.Resampling.BILINEAR)

        gray = np.asarray(image.convert("L"), dtype=np.uint8)
        y_center = estimate_salient_y(gray)
        return to_object_position_offset(
            y_center,
            original_width,
            original_height,
            frame_aspect_ratio,
            offset_limit,
        )


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception as error:
        raise RuntimeError(f"Invalid JSON input: {error}") from error

    items = payload.get("items", [])
    if not isinstance(items, list):
        raise RuntimeError("'items' must be a list.")

    frame_aspect_ratio = float(payload.get("frame_aspect_ratio", DEFAULT_FRAME_ASPECT_RATIO))
    offset_limit = int(round(float(payload.get("offset_limit", DEFAULT_OFFSET_LIMIT))))
    offset_limit = max(1, offset_limit)

    offsets = {}
    warnings = []

    for item in items:
        if not isinstance(item, dict):
            continue
        runtime_path = str(item.get("runtime_path", "")).strip()
        file_path = str(item.get("file_path", "")).strip()
        if not runtime_path:
            continue
        if not file_path:
            offsets[runtime_path] = 0
            warnings.append(f"{runtime_path}: missing file_path")
            continue
        if not os.path.exists(file_path):
            offsets[runtime_path] = 0
            warnings.append(f"{runtime_path}: file not found ({file_path})")
            continue

        try:
            offsets[runtime_path] = estimate_offset_for_image(
                file_path, frame_aspect_ratio, offset_limit
            )
        except Exception as error:
            offsets[runtime_path] = 0
            warnings.append(f"{runtime_path}: {error}")

    json.dump({"offsets": offsets, "warnings": warnings}, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
