from __future__ import annotations

import glob
import os
from pathlib import Path
import sys
from typing import List, Tuple

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "creative-pitch" / "pipeline" / "scripts"))

from pipeline_core import (  # noqa: E402
    as_int,
    extract_all_video_frames,
    filter_jobs_by_scene_ids,
    load_manifest,
    parse_scene_ids,
    rel_to_repo,
    save_manifest,
    story_jobs,
    utc_now_iso,
)


def _cleanup_existing_pngs(target_dir: Path) -> int:
    removed = 0
    for entry in target_dir.glob("frame_*.png"):
        entry.unlink(missing_ok=True)
        removed += 1
    return removed


def main() -> int:
    selected_scene_ids = parse_scene_ids(os.getenv("PITCH_SCENE_IDS", ""))
    overwrite = os.getenv("PITCH_OVERWRITE", "false").strip().lower() == "true"
    default_frame_count = as_int(os.getenv("PITCH_DEFAULT_FRAME_COUNT"), fallback=24, minimum=2)
    manifest = load_manifest()
    jobs = manifest.get("jobs")
    jobs = [job for job in jobs if isinstance(job, dict)] if isinstance(jobs, list) else []
    if not jobs:
        jobs = story_jobs(default_frame_count)
        manifest["jobs"] = jobs
        print(f"image_extract info: rebuilt empty manifest jobs from story ({len(jobs)} scenes).")

    if selected_scene_ids:
        jobs, unknown_ids = filter_jobs_by_scene_ids(jobs, selected_scene_ids)
        if unknown_ids and not jobs:
            rebuilt_jobs = story_jobs(default_frame_count)
            manifest["jobs"] = rebuilt_jobs
            jobs, unknown_ids = filter_jobs_by_scene_ids(rebuilt_jobs, selected_scene_ids)
            if jobs:
                print(
                    "image_extract info: manifest scene list refreshed from story to resolve scene selection."
                )
        if unknown_ids:
            print(f"image_extract warning: unknown scene id(s) ignored: {', '.join(unknown_ids)}")
        print(f"image_extract scene ids: {', '.join(selected_scene_ids)}")
    else:
        print("image_extract scene ids: all")

    ffmpeg_path = str(manifest.get("ffmpegPath") or "ffmpeg")
    extracted = 0
    cleaned = 0
    unresolved: List[Tuple[str, str]] = []

    for job in jobs:
        scene_id = str(job.get("sceneId") or "unknown")
        video_path_raw = job.get("videoPath")
        active_webp_count = int(job.get("activeWebpCount", 0))
        if active_webp_count > 0 and not overwrite:
            job["status"] = "active_frames_present"
            continue

        if not isinstance(video_path_raw, str) or not video_path_raw.strip():
            job["status"] = "video_missing_for_extract"
            unresolved.append((scene_id, "missing videoPath for extraction"))
            continue

        video_path = Path(video_path_raw)
        if not video_path.exists():
            job["status"] = "video_missing_for_extract"
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
    print(f"- overwrite existing outputs: {overwrite}")

    if unresolved:
        print("image_extract warnings (continuing pipeline):")
        for scene_id, reason in unresolved:
            print(f"- {scene_id}: {reason}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
