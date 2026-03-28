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
    RUNS_ROOT,
    as_int,
    find_keyframe_file,
    openai_generate_image,
    openai_generate_image_edit,
    openai_generate_prompt_variants,
    rel_to_repo,
    run_id,
    save_manifest,
    story_jobs,
    summarize_missing,
    utc_now_iso,
)


IMAGES_ROOT = PIPELINE_ROOT / "images"
START_SELECTED_NAME = "start_selected.png"
END_NAME = "end.png"


def _set_keyframe(job: Dict[str, Any], start_path: Path | None, end_path: Path | None) -> None:
    if start_path is not None:
        job["startKeyframePath"] = str(start_path)
        job["startKeyframePathRel"] = rel_to_repo(start_path)
    if end_path is not None:
        job["endKeyframePath"] = str(end_path)
        job["endKeyframePathRel"] = rel_to_repo(end_path)


def _handoff_dir(job: Dict[str, Any]) -> Path:
    return IMAGES_ROOT / str(job["sceneFolder"]) / str(job["sequenceSlug"])


def _copy_image(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def main() -> int:
    if load_dotenv:
        load_dotenv(PIPELINE_ROOT / ".env")
        load_dotenv(PIPELINE_ROOT / ".env.txt")

    default_frame_count = as_int(os.getenv("PITCH_DEFAULT_FRAME_COUNT"), fallback=24, minimum=2)
    scene_limit = max(0, as_int(os.getenv("PITCH_SCENE_LIMIT"), fallback=0, minimum=0))
    run_start = os.getenv("PITCH_IMAGE_GEN_RUN_START", "true").strip().lower() != "false"
    run_end = os.getenv("PITCH_IMAGE_GEN_RUN_END", "true").strip().lower() != "false"
    start_variants = max(1, as_int(os.getenv("PITCH_IMAGE_GEN_START_VARIANTS"), fallback=4, minimum=1))
    prompt_variation_model = os.getenv("OPENAI_PROMPT_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

    jobs = story_jobs(default_frame_count)
    if scene_limit > 0:
        jobs = jobs[:scene_limit]

    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    openai_id = run_id("openai")
    openai_images_root = RUNS_ROOT / "openai" / openai_id / "images"

    generated_count = 0
    start_generated_count = 0
    end_generated_count = 0
    manual_count = 0
    already_ready = 0
    missing: List[Tuple[str, str]] = []

    for job in jobs:
        scene_id = str(job["sceneId"])
        sequence_slug = str(job["sequenceSlug"])
        images_dir = _handoff_dir(job)
        images_dir.mkdir(parents=True, exist_ok=True)
        selected_start = images_dir / START_SELECTED_NAME
        end_image = images_dir / END_NAME

        if int(job.get("activeWebpCount", 0)) > 0:
            job["status"] = "active_frames_present"
            already_ready += 1
            print(
                f"image_gen success: {scene_id} -> active WebP frames already present "
                f"({job.get('activeWebpCount', 0)} frame(s))"
            )
            continue

        job["imageHandoffDir"] = str(images_dir)
        job["imageHandoffDirRel"] = rel_to_repo(images_dir)

        manual_dir = Path(str(job["manualKeyframeDir"]))
        start_manual = find_keyframe_file(manual_dir, "start")
        end_manual = find_keyframe_file(manual_dir, "end")
        if start_manual and end_manual:
            _copy_image(start_manual, selected_start)
            _copy_image(end_manual, end_image)
            _set_keyframe(job, selected_start, end_image)
            job["status"] = "keyframes_ready_manual"
            manual_count += 1
            print(
                f"image_gen success: {scene_id} -> manual keyframes ready "
                f"({rel_to_repo(selected_start)} , {rel_to_repo(end_image)})"
            )
            continue

        openai_cfg = job.get("openai", {}) if isinstance(job.get("openai"), dict) else {}
        start_prompt = str(openai_cfg.get("startPrompt") or "").strip()
        end_prompt = str(openai_cfg.get("endPrompt") or "").strip()

        if (run_start or run_end) and not openai_api_key:
            missing.append((scene_id, "OPENAI_API_KEY is missing."))
            continue

        output_dir = openai_images_root / str(job["sceneFolder"]) / sequence_slug
        generated_start = False
        generated_end = False

        if run_start:
            if not start_prompt:
                missing.append((scene_id, "startPrompt is missing but start generation is enabled."))
                continue
            variant_prompts = openai_generate_prompt_variants(
                api_key=openai_api_key,
                base_prompt=start_prompt,
                variant_count=start_variants,
                model=prompt_variation_model,
            )
            print(
                f"image_gen success: {scene_id} -> generated {len(variant_prompts)} start prompt variants "
                f"using model {prompt_variation_model}"
            )
            for index in range(start_variants):
                option_name = f"start_option_{index + 1:02d}.png"
                run_option_path = output_dir / option_name
                image_option_path = images_dir / option_name
                variant_prompt = variant_prompts[index]
                openai_generate_image(
                    api_key=openai_api_key,
                    prompt=variant_prompt,
                    output_path=run_option_path,
                    model=str(openai_cfg.get("model", "gpt-image-1")),
                    size=str(openai_cfg.get("size", "1536x1024")),
                    quality=str(openai_cfg.get("quality", "low")),
                    style=str(openai_cfg.get("style", "natural")),
                )
                _copy_image(run_option_path, image_option_path)
                generated_start = True
                print(
                    f"image_gen success: {scene_id} -> start option {index + 1}/{start_variants} "
                    f"at {rel_to_repo(image_option_path)}"
                )

            if start_variants == 1 and not selected_start.exists():
                first_option = images_dir / "start_option_01.png"
                if first_option.exists():
                    _copy_image(first_option, selected_start)
                    print(
                        f"image_gen success: {scene_id} -> auto-selected start frame "
                        f"at {rel_to_repo(selected_start)}"
                    )

        if run_end:
            if not end_prompt:
                missing.append((scene_id, "endPrompt is missing but end generation is enabled."))
                continue
            if not selected_start.exists():
                missing.append(
                    (
                        scene_id,
                        f"start selection missing. Choose one start_option_##.png and save as {START_SELECTED_NAME} "
                        f"in {rel_to_repo(images_dir)} before running end generation.",
                    )
                )
                continue

            run_end_path = output_dir / END_NAME
            guided_end_prompt = (
                "Transform this exact input image into the end state while preserving the same "
                "camera position, framing, lens feel, composition, lighting logic, and core style. "
                f"{end_prompt}"
            )
            openai_generate_image_edit(
                api_key=openai_api_key,
                prompt=guided_end_prompt,
                input_image_path=selected_start,
                output_path=run_end_path,
                model=str(openai_cfg.get("model", "gpt-image-1")),
                size=str(openai_cfg.get("size", "1536x1024")),
                quality=str(openai_cfg.get("quality", "low")),
            )
            _copy_image(run_end_path, end_image)
            generated_end = True
            print(f"image_gen success: {scene_id} -> end frame at {rel_to_repo(end_image)}")

        if generated_start:
            start_generated_count += 1
        if generated_end:
            end_generated_count += 1

        if selected_start.exists() and end_image.exists():
            _set_keyframe(job, selected_start, end_image)
            job["status"] = "keyframes_ready_images"
            generated_count += 1
            print(
                f"image_gen success: {scene_id} -> keyframes ready for animation "
                f"({rel_to_repo(selected_start)} , {rel_to_repo(end_image)})"
            )
            continue

        if run_start and not run_end and (images_dir / "start_option_01.png").exists():
            job["status"] = "start_options_ready"
            continue

        if selected_start.exists() and not end_image.exists():
            job["status"] = "waiting_for_end_frame"
            continue

        if start_manual or end_manual:
            missing.append((scene_id, "Only one manual keyframe was found. Provide both start.* and end.* files."))
        elif run_start or run_end:
            missing.append((scene_id, "Start/end keyframes are not ready in pipeline/images."))

    manifest = {
        "generatedAt": utc_now_iso(),
        "pipeline": "creative-pitch-story",
        "defaultFrameCount": default_frame_count,
        "sceneLimit": scene_limit,
        "imageGenerationMode": {
            "runStart": run_start,
            "runEnd": run_end,
            "startVariants": start_variants,
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
    print(f"- scene limit: {'all' if scene_limit == 0 else scene_limit}")
    print(f"- image_gen run_start: {run_start}")
    print(f"- image_gen run_end: {run_end}")
    print(f"- start variants: {start_variants}")
    print(f"- scenes already active (webp present): {already_ready}")
    print(f"- scenes ready from manual keyframes: {manual_count}")
    print(f"- scenes generated by OpenAI: {generated_count}")
    print(f"- scenes with generated start options: {start_generated_count}")
    print(f"- scenes with generated end frame: {end_generated_count}")

    if missing:
        print(summarize_missing(missing))
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
