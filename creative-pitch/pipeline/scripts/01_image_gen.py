from __future__ import annotations

import os
from pathlib import Path
import shutil
import sys
from typing import Any, Dict, List, Tuple

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "creative-pitch" / "pipeline" / "scripts"))

from pipeline_core import (  # noqa: E402
    PIPELINE_ROOT,
    PRODUCTION_START_DIR,
    RUNS_ROOT,
    active_video_path,
    as_int,
    filter_jobs_by_scene_ids,
    find_keyframe_file,
    openai_generate_image,
    parse_scene_ids,
    production_start_path,
    rel_to_repo,
    run_id,
    save_manifest,
    story_jobs,
    summarize_missing,
    utc_now_iso,
)


START_NAME = "start.png"


def _set_keyframe(job: Dict[str, Any], start_path: Path | None) -> None:
    if start_path is not None:
        job["startKeyframePath"] = str(start_path)
        job["startKeyframePathRel"] = rel_to_repo(start_path)


def _copy_image(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def _prompt_from_story(job: Dict[str, Any], key: str) -> str:
    openai_cfg = job.get("openai")
    if not isinstance(openai_cfg, dict):
        return ""
    value = openai_cfg.get(key)
    if not isinstance(value, str):
        return ""
    return value.strip()


def _path_exists(raw: Any) -> bool:
    return isinstance(raw, str) and raw.strip() != "" and Path(raw).exists()


def main() -> int:
    if load_dotenv:
        load_dotenv(PIPELINE_ROOT / ".env")
        load_dotenv(PIPELINE_ROOT / ".env.txt")

    default_frame_count = as_int(os.getenv("PITCH_DEFAULT_FRAME_COUNT"), fallback=24, minimum=2)
    scene_limit = max(0, as_int(os.getenv("PITCH_SCENE_LIMIT"), fallback=0, minimum=0))
    selected_scene_ids = parse_scene_ids(os.getenv("PITCH_SCENE_IDS", ""))
    run_start = os.getenv("PITCH_IMAGE_GEN_RUN_START", "true").strip().lower() != "false"
    overwrite = os.getenv("PITCH_OVERWRITE", "false").strip().lower() == "true"
    copy_start_to_production = (
        os.getenv("PITCH_COPY_START_TO_PRODUCTION", "false").strip().lower() == "true"
    )

    jobs = story_jobs(default_frame_count)
    if selected_scene_ids:
        jobs, unknown_ids = filter_jobs_by_scene_ids(jobs, selected_scene_ids)
        if unknown_ids:
            print(f"image_gen warning: unknown scene id(s) ignored: {', '.join(unknown_ids)}")
    elif scene_limit > 0:
        jobs = jobs[:scene_limit]

    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    openai_id = run_id("openai")
    openai_images_root = RUNS_ROOT / "openai" / openai_id / "images"

    ready_count = 0
    start_generated_count = 0
    manual_count = 0
    already_ready = 0
    start_skipped_validated = 0
    start_copied_to_production = 0
    missing: List[Tuple[str, str]] = []

    for job in jobs:
        scene_id = str(job["sceneId"])
        sequence_slug = str(job["sequenceSlug"])
        scene_folder = str(job["sceneFolder"])
        active_video = active_video_path(job)
        job["activeVideoPath"] = str(active_video)
        job["activeVideoPathRel"] = rel_to_repo(active_video)
        job["activeVideoExists"] = active_video.exists()

        if active_video.exists() and not overwrite:
            job["status"] = "active_video_present"
            already_ready += 1
            print(
                f"image_gen success: {scene_id} -> active MP4 already present "
                f"({rel_to_repo(active_video)})"
            )
            continue

        production_start = production_start_path(job)
        production_start.parent.mkdir(parents=True, exist_ok=True)

        job["productionStartPath"] = str(production_start)
        job["productionStartPathRel"] = rel_to_repo(production_start)

        manual_dir = Path(str(job["manualKeyframeDir"]))
        start_manual = find_keyframe_file(manual_dir, "start")
        if start_manual and not production_start.exists():
            if not production_start.exists():
                _copy_image(start_manual, production_start)
            _set_keyframe(job, production_start)
            job["status"] = "start_ready_manual"
            manual_count += 1
            print(
                f"image_gen success: {scene_id} -> manual start keyframe copied to production "
                f"({rel_to_repo(production_start)})"
            )
            continue

        openai_cfg = job.get("openai", {}) if isinstance(job.get("openai"), dict) else {}
        start_prompt = _prompt_from_story(job, "startPrompt")

        output_dir = openai_images_root / scene_folder / sequence_slug
        generated_start = False

        if run_start:
            should_generate_start = False
            if production_start.exists():
                if overwrite:
                    print(
                        f"image_gen overwrite: {scene_id} -> regenerating start despite existing "
                        f"{rel_to_repo(production_start)}"
                    )
                    should_generate_start = True
                else:
                    start_skipped_validated += 1
                    print(
                        f"image_gen skipped: {scene_id} -> validated start already exists at "
                        f"{rel_to_repo(production_start)}"
                    )
            else:
                should_generate_start = True

            if should_generate_start:
                if not start_prompt:
                    missing.append((scene_id, "scene.media.generation.openai.startPrompt is missing."))
                elif not openai_api_key:
                    missing.append((scene_id, "OPENAI_API_KEY is missing for start generation."))
                else:
                    run_start_path = output_dir / START_NAME
                    openai_generate_image(
                        api_key=openai_api_key,
                        prompt=start_prompt,
                        output_path=run_start_path,
                        model=str(openai_cfg.get("model", "gpt-image-1")),
                        size=str(openai_cfg.get("size", "1536x1024")),
                        quality=str(openai_cfg.get("quality", "low")),
                        style=str(openai_cfg.get("style", "natural")),
                    )
                    job["startRunPath"] = str(run_start_path)
                    job["startRunPathRel"] = rel_to_repo(run_start_path)
                    generated_start = True
                    if copy_start_to_production:
                        _copy_image(run_start_path, production_start)
                        start_copied_to_production += 1
                        print(
                            f"image_gen success: {scene_id} -> start generated and copied to production "
                            f"({rel_to_repo(run_start_path)} -> {rel_to_repo(production_start)})"
                        )
                    else:
                        print(
                            f"image_gen success: {scene_id} -> start candidate generated at "
                            f"{rel_to_repo(run_start_path)}. Copy to {rel_to_repo(production_start)} to validate."
                        )

        if generated_start:
            start_generated_count += 1
        if production_start.exists():
            _set_keyframe(job, production_start)
            job["status"] = "start_ready_production"
            ready_count += 1
            continue

        job["status"] = "waiting_for_validated_start"

    manifest = {
        "generatedAt": utc_now_iso(),
        "pipeline": "creative-pitch-story",
        "defaultFrameCount": default_frame_count,
        "sceneLimit": scene_limit if not selected_scene_ids else 0,
        "sceneIds": selected_scene_ids,
        "productionStartDirRel": rel_to_repo(PRODUCTION_START_DIR),
        "imageGenerationMode": {
            "runStart": run_start,
            "overwrite": overwrite,
            "copyStartToProduction": copy_start_to_production,
        },
        "openaiRunId": openai_id if start_generated_count else None,
        "openaiRunDirRel": rel_to_repo(openai_images_root.parent) if start_generated_count else None,
        "jobs": jobs,
    }
    manifest_path = save_manifest(manifest)

    print(f"Wrote manifest: {manifest_path}")
    print(f"- scenes total: {len(jobs)}")
    print(f"- scene ids: {', '.join(selected_scene_ids) if selected_scene_ids else 'all'}")
    print(
        f"- scene limit: {'ignored (scene ids selected)' if selected_scene_ids else ('all' if scene_limit == 0 else scene_limit)}"
    )
    print(f"- image_gen run_start: {run_start}")
    print(f"- overwrite existing outputs: {overwrite}")
    print(f"- copy start to production: {copy_start_to_production}")
    print(f"- production starts ready: {sum(1 for job in jobs if _path_exists(job.get('productionStartPath')))}")
    print(f"- scenes ready for animation (validated start): {ready_count}")
    print(f"- scenes already active (mp4 present): {already_ready}")
    print(f"- scenes ready from manual start keyframes: {manual_count}")
    print(f"- generated start candidates: {start_generated_count}")
    print(f"- generated starts copied to production: {start_copied_to_production}")
    print(f"- start skipped (validated exists): {start_skipped_validated}")

    if missing:
        print(summarize_missing(missing))
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
