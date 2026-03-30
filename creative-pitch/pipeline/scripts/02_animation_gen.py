from __future__ import annotations

import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple
import urllib.request

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "creative-pitch" / "pipeline" / "scripts"))

from pipeline_core import (  # noqa: E402
    PIPELINE_ROOT,
    RUNS_ROOT,
    PipelineError,
    load_manifest,
    rel_to_repo,
    run_id,
    save_manifest,
    utc_now_iso,
)

START_SELECTED_NAME = "start_selected.png"
END_NAME = "end.png"


class RunwayGenerationError(RuntimeError):
    pass


class RunwayVideoGenerator:
    def __init__(self, api_key: str, api_version: str, timeout_seconds: int = 900):
        try:
            from runwayml import RunwayML, TaskFailedError
        except ImportError as exc:
            raise RunwayGenerationError(
                "runwayml package is not installed. Install pipeline requirements first."
            ) from exc

        self._task_failed_error = TaskFailedError
        self.client = RunwayML(api_key=api_key)
        self.api_version = api_version
        self.timeout_seconds = timeout_seconds

    def upload_ephemeral(self, local_path: str | Path) -> str:
        local_path = Path(local_path)
        response = self.client.uploads.create_ephemeral(file=local_path)
        return response.uri

    def generate_video(
        self,
        *,
        model: str,
        prompt_text: str,
        first_frame_uri: str,
        last_frame_uri: str,
        ratio: str,
        duration_seconds: int,
        seed: Optional[int],
        public_figure_threshold: str,
    ) -> Dict[str, Any]:
        attempts = [
            {"include_last": True, "include_seed": seed is not None},
            {"include_last": False, "include_seed": seed is not None},
            {"include_last": False, "include_seed": False},
        ]

        output = None
        last_exc: Exception | None = None
        used_input_mode = "first+last"

        for attempt in attempts:
            kwargs: Dict[str, Any] = {
                "model": model,
                "prompt_text": prompt_text,
                "prompt_image": [{"uri": first_frame_uri, "position": "first"}],
                "ratio": ratio,
                "duration": duration_seconds,
                "content_moderation": {"public_figure_threshold": public_figure_threshold},
                "extra_headers": {"X-Runway-Version": self.api_version},
            }
            if attempt["include_last"]:
                kwargs["prompt_image"].append({"uri": last_frame_uri, "position": "last"})
            if attempt["include_seed"] and seed is not None:
                kwargs["seed"] = seed

            try:
                request = self.client.image_to_video.create(**kwargs)
                output = request.wait_for_task_output(timeout=self.timeout_seconds)
                used_input_mode = "first+last" if attempt["include_last"] else "first_only"
                break
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                message = str(exc)
                prompt_image_rejected = (
                    "promptImage" in message
                    or "position" in message
                    or "Too big: expected array to have <=1 items" in message
                )
                seed_rejected = "seed" in message and ("null" in message or "invalid_type" in message)

                if attempt["include_last"] and prompt_image_rejected:
                    continue
                if attempt["include_seed"] and seed_rejected:
                    continue

                raise RunwayGenerationError(message) from exc

        if output is None:
            raise RunwayGenerationError(str(last_exc) if last_exc else "Runway generation failed.")

        return {
            "task_id": output.id,
            "status": output.status,
            "output": list(output.output),
            "input_mode": used_input_mode,
        }


def _to_int_or_none(raw: Any) -> Optional[int]:
    try:
        if raw is None or raw == "":
            return None
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def _default_prompt(job: Dict[str, Any]) -> str:
    scene_title = str(job.get("sceneTitle") or "scene")
    scene_description = str(job.get("sceneDescription") or "").strip()
    brief = f"{scene_title}. {scene_description}".strip().strip(".")
    return (
        f"Animate a smooth scene progression for {brief}. "
        "Preserve subject continuity and composition from the provided keyframes. "
        "Use a slightly abstract visual language with expressive light transitions and atmospheric flow. "
        "Avoid photorealism, avoid hard cuts, avoid camera jitter."
    )


def main() -> int:
    if load_dotenv:
        load_dotenv(PIPELINE_ROOT / ".env")
        load_dotenv(PIPELINE_ROOT / ".env.txt")

    manifest = load_manifest()
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list):
        raise PipelineError("Manifest is missing jobs[].")

    needs_generation: List[Dict[str, Any]] = []
    missing_keyframes: List[Tuple[str, str]] = []

    for job in jobs:
        if not isinstance(job, dict):
            continue
        if int(job.get("activeWebpCount", 0)) > 0:
            job["status"] = "active_frames_present"
            continue

        scene_id = str(job.get("sceneId") or "unknown")
        scene_folder = str(job.get("sceneFolder") or scene_id.lower())
        sequence_slug = str(job.get("sequenceSlug") or "sequence")
        image_handoff_dir = PIPELINE_ROOT / "images" / scene_folder / sequence_slug
        start_path = image_handoff_dir / START_SELECTED_NAME
        end_path = image_handoff_dir / END_NAME

        if not start_path.exists() or not end_path.exists():
            missing_keyframes.append(
                (
                    scene_id,
                    f"expected {START_SELECTED_NAME} and {END_NAME} in {rel_to_repo(image_handoff_dir)}",
                )
            )
            continue

        job["startKeyframePath"] = str(start_path)
        job["startKeyframePathRel"] = rel_to_repo(start_path)
        job["endKeyframePath"] = str(end_path)
        job["endKeyframePathRel"] = rel_to_repo(end_path)
        needs_generation.append(job)

    if missing_keyframes:
        for scene_id, reason in missing_keyframes:
            print(f"- {scene_id}: {reason}")
        print("Run image_gen and choose a start option as start_selected.png in pipeline/images.")
        return 1

    if not needs_generation:
        print("animation_gen: nothing to do (all scenes already have active WebP frames).")
        manifest["updatedAt"] = utc_now_iso()
        save_manifest(manifest)
        return 0

    api_key = os.getenv("RUNWAYML_API_SECRET", "").strip()
    if not api_key:
        print("RUNWAYML_API_SECRET is required for animation_gen.")
        return 1

    api_version = os.getenv("RUNWAY_API_VERSION", "2024-11-06")
    timeout_seconds = _to_int_or_none(os.getenv("RUNWAY_POLL_TIMEOUT_SECONDS")) or 900

    generator = RunwayVideoGenerator(
        api_key=api_key,
        api_version=api_version,
        timeout_seconds=timeout_seconds,
    )

    runway_id = run_id("runway")
    videos_root = RUNS_ROOT / "runway" / runway_id / "videos"

    generated = 0
    failures: List[Tuple[str, str]] = []

    for job in needs_generation:
        scene_id = str(job.get("sceneId") or "unknown")
        scene_folder = str(job.get("sceneFolder") or scene_id.lower())
        sequence_slug = str(job.get("sequenceSlug") or "sequence")

        start_path = Path(str(job["startKeyframePath"]))
        end_path = Path(str(job["endKeyframePath"]))

        runway_cfg = job.get("runway", {}) if isinstance(job.get("runway"), dict) else {}
        model = str(runway_cfg.get("model") or "gen4.5")
        ratio = str(runway_cfg.get("ratio") or "1280:720")
        duration_seconds = _to_int_or_none(runway_cfg.get("durationSeconds")) or 5
        seed = _to_int_or_none(runway_cfg.get("seed"))
        public_threshold = str(runway_cfg.get("publicFigureThreshold") or "auto")
        prompt = str(runway_cfg.get("prompt") or "").strip() or _default_prompt(job)

        output_video = videos_root / scene_folder / f"{sequence_slug}.mp4"
        output_video.parent.mkdir(parents=True, exist_ok=True)

        try:
            first_uri = generator.upload_ephemeral(start_path)
            last_uri = generator.upload_ephemeral(end_path)
            result = generator.generate_video(
                model=model,
                prompt_text=prompt,
                first_frame_uri=first_uri,
                last_frame_uri=last_uri,
                ratio=ratio,
                duration_seconds=duration_seconds,
                seed=seed,
                public_figure_threshold=public_threshold,
            )

            output_urls = result.get("output")
            if not isinstance(output_urls, list) or not output_urls:
                raise RunwayGenerationError("Runway response did not contain output URLs.")

            with urllib.request.urlopen(str(output_urls[0]), timeout=240) as response:
                output_video.write_bytes(response.read())

            job["videoPath"] = str(output_video)
            job["videoPathRel"] = rel_to_repo(output_video)
            job["runwayTaskId"] = result.get("task_id")
            job["runwayInputMode"] = result.get("input_mode")
            job["status"] = "video_generated"
            generated += 1
            print(
                f"animation_gen success: {scene_id} -> {output_video} "
                f"(mode={job.get('runwayInputMode')}, task={job.get('runwayTaskId')})"
            )
        except Exception as exc:  # noqa: BLE001
            failures.append((scene_id, str(exc)))
            job["status"] = "video_failed"
            job["error"] = str(exc)

    manifest["updatedAt"] = utc_now_iso()
    manifest["runwayRunId"] = runway_id
    manifest["runwayRunDirRel"] = rel_to_repo(videos_root.parent)
    save_manifest(manifest)

    print(f"animation_gen complete. videos generated: {generated}")

    if failures:
        print("Runway generation failures:")
        for scene_id, detail in failures:
            print(f"- {scene_id}: {detail}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
