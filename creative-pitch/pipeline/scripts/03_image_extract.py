from __future__ import annotations

import glob
from pathlib import Path
import sys
from typing import List, Tuple

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "creative-pitch" / "pipeline" / "scripts"))

from pipeline_core import (  # noqa: E402
    PipelineError,
    extract_all_video_frames,
    load_manifest,
    rel_to_repo,
    save_manifest,
    utc_now_iso,
)


def _cleanup_existing_pngs(target_dir: Path) -> int:
    removed = 0
    for entry in target_dir.glob("frame_*.png"):
        entry.unlink(missing_ok=True)
        removed += 1
    return removed


def main() -> int:
    manifest = load_manifest()
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list):
        raise PipelineError("Manifest is missing jobs[].")

    ffmpeg_path = str(manifest.get("ffmpegPath") or "ffmpeg")
    extracted = 0
    cleaned = 0
    unresolved: List[Tuple[str, str]] = []

    for job in jobs:
        if not isinstance(job, dict):
            continue

        scene_id = str(job.get("sceneId") or "unknown")
        video_path_raw = job.get("videoPath")
        active_webp_count = int(job.get("activeWebpCount", 0))

        if not isinstance(video_path_raw, str) or not video_path_raw.strip():
            if active_webp_count > 0:
                job["status"] = "active_frames_present"
                continue
            unresolved.append((scene_id, "missing videoPath for extraction"))
            continue

        video_path = Path(video_path_raw)
        if not video_path.exists():
            if active_webp_count > 0:
                job["status"] = "active_frames_present"
                continue
            unresolved.append((scene_id, f"video file not found: {video_path}"))
            continue

        png_pattern = Path(str(job.get("extractPatternPng")))
        png_pattern.parent.mkdir(parents=True, exist_ok=True)
        cleaned += _cleanup_existing_pngs(png_pattern.parent)

        extract_all_video_frames(
            ffmpeg_path=ffmpeg_path,
            video_path=video_path,
            output_pattern=png_pattern,
            overwrite=True,
        )

        png_files = sorted(glob.glob(str(png_pattern.parent / "frame_*.png")))
        extracted_count = len(png_files)
        job["extractedPngCount"] = len(png_files)
        job["extractedPngDir"] = str(png_pattern.parent)
        job["extractedPngDirRel"] = rel_to_repo(png_pattern.parent)
        job["frameCount"] = extracted_count
        job["status"] = "frames_extracted_png"
        extracted += 1
        print(
            f"Extracted PNG frames for {scene_id}: {png_pattern.parent} "
            f"(all video frames, count={extracted_count})"
        )

    manifest["updatedAt"] = utc_now_iso()
    save_manifest(manifest)

    print(f"image_extract complete. scenes extracted: {extracted}")
    print(f"- stale PNG frames removed before extraction: {cleaned}")

    if unresolved:
        print("Extraction blocked for scenes:")
        for scene_id, reason in unresolved:
            print(f"- {scene_id}: {reason}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
