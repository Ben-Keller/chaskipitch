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
    PRODUCTION_END_DIR,
    PRODUCTION_START_DIR,
    RUNS_ROOT,
    active_video_path,
    as_int,
    filter_jobs_by_scene_ids,
    find_keyframe_file,
    openai_generate_image,
    openai_generate_image_edit,
    parse_scene_ids,
    production_end_path,
    production_start_path,
    rel_to_repo,
    run_id,
    save_manifest,
    story_jobs,
    summarize_missing,
    utc_now_iso,
)


START_NAME = "start.png"
END_NAME = "end.png"


def _set_keyframe(job: Dict[str, Any], start_path: Path | None, end_path: Path | None) -> None:
    if start_path is not None:
        job["startKeyframePath"] = str(start_path)
        job["startKeyframePathRel"] = rel_to_repo(start_path)
    if end_path is not None:
        job["endKeyframePath"] = str(end_path)
        job["endKeyframePathRel"] = rel_to_repo(end_path)


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


def _files_are_identical(path_a: Path, path_b: Path) -> bool:
    try:
        if not path_a.exists() or not path_b.exists():
            return False
        if path_a.stat().st_size != path_b.stat().st_size:
            return False
        return path_a.read_bytes() == path_b.read_bytes()
    except OSError:
        return False


def main() -> int:
    if load_dotenv:
        load_dotenv(PIPELINE_ROOT / ".env")
        load_dotenv(PIPELINE_ROOT / ".env.txt")

    default_frame_count = as_int(os.getenv("PITCH_DEFAULT_FRAME_COUNT"), fallback=24, minimum=2)
    scene_limit = max(0, as_int(os.getenv("PITCH_SCENE_LIMIT"), fallback=0, minimum=0))
    selected_scene_ids = parse_scene_ids(os.getenv("PITCH_SCENE_IDS", ""))
    run_start = os.getenv("PITCH_IMAGE_GEN_RUN_START", "true").strip().lower() != "false"
    run_end = os.getenv("PITCH_IMAGE_GEN_RUN_END", "true").strip().lower() != "false"
    overwrite = os.getenv("PITCH_OVERWRITE", "false").strip().lower() == "true"
    copy_start_to_production = (
        os.getenv("PITCH_COPY_START_TO_PRODUCTION", "false").strip().lower() == "true"
    )
    copy_end_to_production = (
        os.getenv("PITCH_COPY_END_TO_PRODUCTION", "false").strip().lower() == "true"
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
    end_generated_count = 0
    manual_count = 0
    already_ready = 0
    start_skipped_validated = 0
    end_skipped_validated = 0
    end_skipped_missing_start = 0
    start_copied_to_production = 0
    end_copied_to_production = 0
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
        production_end = production_end_path(job)
        production_start.parent.mkdir(parents=True, exist_ok=True)
        production_end.parent.mkdir(parents=True, exist_ok=True)

        job["productionStartPath"] = str(production_start)
        job["productionStartPathRel"] = rel_to_repo(production_start)
        job["productionEndPath"] = str(production_end)
        job["productionEndPathRel"] = rel_to_repo(production_end)

        manual_dir = Path(str(job["manualKeyframeDir"]))
        start_manual = find_keyframe_file(manual_dir, "start")
        end_manual = find_keyframe_file(manual_dir, "end")
        if start_manual and end_manual and (not production_start.exists() or not production_end.exists()):
            if not production_start.exists():
                _copy_image(start_manual, production_start)
            if not production_end.exists():
                _copy_image(end_manual, production_end)
            _set_keyframe(job, production_start, production_end)
            job["status"] = "keyframes_ready_manual"
            manual_count += 1
            print(
                f"image_gen success: {scene_id} -> manual keyframes copied to production "
                f"({rel_to_repo(production_start)} , {rel_to_repo(production_end)})"
            )
            continue

        openai_cfg = job.get("openai", {}) if isinstance(job.get("openai"), dict) else {}
        start_prompt = _prompt_from_story(job, "startPrompt")
        end_delta = _prompt_from_story(job, "delta")

        output_dir = openai_images_root / scene_folder / sequence_slug
        generated_start = False
        generated_end = False

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

        if run_end:
            should_generate_end = False
            if production_end.exists():
                if production_start.exists() and _files_are_identical(production_start, production_end):
                    print(
                        f"image_gen warning: {scene_id} -> validated end matches start exactly; "
                        "regenerating end frame."
                    )
                    production_end.unlink(missing_ok=True)
                    should_generate_end = True
                elif overwrite:
                    print(
                        f"image_gen overwrite: {scene_id} -> regenerating end despite existing "
                        f"{rel_to_repo(production_end)}"
                    )
                    should_generate_end = True
                else:
                    end_skipped_validated += 1
                    print(
                        f"image_gen skipped: {scene_id} -> validated end already exists at "
                        f"{rel_to_repo(production_end)}"
                    )
            else:
                should_generate_end = True

            if should_generate_end and not production_start.exists():
                end_skipped_missing_start += 1
                print(
                    f"image_gen skipped: {scene_id} -> validated start is missing at "
                    f"{rel_to_repo(production_start)}"
                )
            if should_generate_end and production_start.exists():
                if not end_delta:
                    missing.append((scene_id, "scene.media.generation.openai.delta is missing."))
                elif not openai_api_key:
                    missing.append((scene_id, "OPENAI_API_KEY is missing for end generation."))
                else:
                    run_end_path = output_dir / END_NAME
                    end_prompt = (
                        "Transform this exact start image into the evolved end state while preserving "
                        "composition, framing, lens feel, and visual continuity. Apply only these changes: "
                        f"{end_delta}"
                    )
                    openai_generate_image_edit(
                        api_key=openai_api_key,
                        prompt=end_prompt,
                        input_image_path=production_start,
                        output_path=run_end_path,
                        model=str(openai_cfg.get("model", "gpt-image-1")),
                        size=str(openai_cfg.get("size", "1536x1024")),
                        quality=str(openai_cfg.get("quality", "low")),
                    )
                    job["endRunPath"] = str(run_end_path)
                    job["endRunPathRel"] = rel_to_repo(run_end_path)
                    generated_end = True
                    if copy_end_to_production:
                        _copy_image(run_end_path, production_end)
                        end_copied_to_production += 1
                        print(
                            f"image_gen success: {scene_id} -> end generated and copied to production "
                            f"({rel_to_repo(run_end_path)} -> {rel_to_repo(production_end)})"
                        )
                    else:
                        print(
                            f"image_gen success: {scene_id} -> end candidate generated at "
                            f"{rel_to_repo(run_end_path)}. Copy to {rel_to_repo(production_end)} to validate."
                        )

        if generated_start:
            start_generated_count += 1
        if generated_end:
            end_generated_count += 1

        if production_start.exists() and production_end.exists():
            _set_keyframe(job, production_start, production_end)
            job["status"] = "keyframes_ready_production"
            ready_count += 1
            continue

        if production_start.exists() and not production_end.exists():
            job["status"] = "waiting_for_validated_end"
            continue

        job["status"] = "waiting_for_validated_start"

    manifest = {
        "generatedAt": utc_now_iso(),
        "pipeline": "creative-pitch-story",
        "defaultFrameCount": default_frame_count,
        "sceneLimit": scene_limit if not selected_scene_ids else 0,
        "sceneIds": selected_scene_ids,
        "productionStartDirRel": rel_to_repo(PRODUCTION_START_DIR),
        "productionEndDirRel": rel_to_repo(PRODUCTION_END_DIR),
        "imageGenerationMode": {
            "runStart": run_start,
            "runEnd": run_end,
            "overwrite": overwrite,
            "copyStartToProduction": copy_start_to_production,
            "copyEndToProduction": copy_end_to_production,
        },
        "openaiRunId": openai_id if (start_generated_count or end_generated_count) else None,
        "openaiRunDirRel": rel_to_repo(openai_images_root.parent)
        if (start_generated_count or end_generated_count)
        else None,
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
    print(f"- image_gen run_end: {run_end}")
    print(f"- overwrite existing outputs: {overwrite}")
    print(f"- copy start to production: {copy_start_to_production}")
    print(f"- copy end to production: {copy_end_to_production}")
    print(f"- production starts ready: {sum(1 for job in jobs if _path_exists(job.get('productionStartPath')))}")
    print(f"- production ends ready: {sum(1 for job in jobs if _path_exists(job.get('productionEndPath')))}")
    print(f"- scenes ready for animation (production): {ready_count}")
    print(f"- scenes already active (mp4 present): {already_ready}")
    print(f"- scenes ready from manual keyframes: {manual_count}")
    print(f"- generated start candidates: {start_generated_count}")
    print(f"- generated end candidates: {end_generated_count}")
    print(f"- generated starts copied to production: {start_copied_to_production}")
    print(f"- generated ends copied to production: {end_copied_to_production}")
    print(f"- start skipped (validated exists): {start_skipped_validated}")
    print(f"- end skipped (validated exists): {end_skipped_validated}")
    print(f"- end skipped (validated start missing): {end_skipped_missing_start}")

    if missing:
        print(summarize_missing(missing))
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
