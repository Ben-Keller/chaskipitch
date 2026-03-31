from __future__ import annotations

import os
from pathlib import Path
import shutil
import tempfile
import time
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
    active_video_path,
    as_int,
    filter_jobs_by_scene_ids,
    load_manifest,
    parse_scene_ids,
    production_end_path,
    production_start_path,
    rel_to_repo,
    run_id,
    save_manifest,
    story_jobs,
    utc_now_iso,
)


class RunwayGenerationError(RuntimeError):
    pass


class RunwayVideoGenerator:
    def __init__(
        self,
        api_key: str,
        api_version: str,
        timeout_seconds: int = 900,
        http_timeout_seconds: float = 120.0,
        http_max_retries: int = 4,
    ):
        try:
            from runwayml import RunwayML, TaskFailedError
        except ImportError as exc:
            raise RunwayGenerationError(
                "runwayml package is not installed. Install pipeline requirements first."
            ) from exc

        self._task_failed_error = TaskFailedError
        self.client = RunwayML(
            api_key=api_key,
            runway_version=api_version,
            timeout=http_timeout_seconds,
            max_retries=http_max_retries,
        )
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


def _to_float_or_none(raw: Any) -> Optional[float]:
    try:
        if raw is None or raw == "":
            return None
        return float(raw)
    except (TypeError, ValueError):
        return None


def _is_timeout_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "timed out" in message or "timeout" in message


def _upload_ephemeral_with_retries(
    *,
    generator: RunwayVideoGenerator,
    local_path: Path,
    label: str,
    max_attempts: int = 3,
) -> str:
    errors: List[str] = []
    for attempt in range(1, max_attempts + 1):
        try:
            return generator.upload_ephemeral(local_path)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{attempt}/{max_attempts}: {exc}")
            if attempt < max_attempts and _is_timeout_error(exc):
                time.sleep(min(6.0, 1.4 * attempt))
                continue
            raise RunwayGenerationError(
                f"Failed uploading {label} after {attempt} attempt(s): {exc}"
            ) from exc
    raise RunwayGenerationError(
        f"Failed uploading {label} after retries: {' | '.join(errors[-3:])}"
    )


def _generate_video_with_retries(
    *,
    generator: RunwayVideoGenerator,
    model: str,
    prompt_text: str,
    first_frame_uri: str,
    last_frame_uri: str,
    ratio: str,
    duration_seconds: int,
    seed: Optional[int],
    public_figure_threshold: str,
    max_attempts: int = 2,
) -> Dict[str, Any]:
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return generator.generate_video(
                model=model,
                prompt_text=prompt_text,
                first_frame_uri=first_frame_uri,
                last_frame_uri=last_frame_uri,
                ratio=ratio,
                duration_seconds=duration_seconds,
                seed=seed,
                public_figure_threshold=public_figure_threshold,
            )
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < max_attempts and _is_timeout_error(exc):
                time.sleep(min(8.0, 1.8 * attempt))
                continue
            raise
    raise RunwayGenerationError(
        f"Runway generation failed after retries: {last_exc}" if last_exc else "Runway generation failed."
    )


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


def _download_video_with_retries(
    *,
    output_urls: List[str],
    output_video: Path,
    timeout_seconds: int = 240,
    max_attempts: int = 3,
) -> None:
    if not output_urls:
        raise RunwayGenerationError("Runway response did not contain output URLs.")

    recent_errors: List[str] = []
    for attempt in range(1, max_attempts + 1):
        for url_index, raw_url in enumerate(output_urls):
            url = str(raw_url).strip()
            if not url:
                continue

            temp_path: Path | None = None
            try:
                output_video.parent.mkdir(parents=True, exist_ok=True)
                with urllib.request.urlopen(url, timeout=timeout_seconds) as response:
                    payload = response.read()

                with tempfile.NamedTemporaryFile(
                    mode="wb",
                    suffix=".mp4.part",
                    prefix=f"{output_video.stem}_",
                    dir=str(output_video.parent),
                    delete=False,
                ) as handle:
                    handle.write(payload)
                    temp_path = Path(handle.name)

                os.replace(temp_path, output_video)
                return
            except Exception as exc:  # noqa: BLE001
                detail = (
                    f"attempt {attempt}/{max_attempts}, url {url_index + 1}/{len(output_urls)}: {exc}"
                )
                recent_errors.append(detail)
                recent_errors = recent_errors[-6:]
                if temp_path is not None:
                    temp_path.unlink(missing_ok=True)

        if attempt < max_attempts:
            wait_seconds = min(6.0, 1.2 * attempt)
            time.sleep(wait_seconds)

    raise RunwayGenerationError(
        "Failed to download Runway output video after retries. "
        + " | ".join(recent_errors[-3:])
    )


def main() -> int:
    if load_dotenv:
        load_dotenv(PIPELINE_ROOT / ".env")
        load_dotenv(PIPELINE_ROOT / ".env.txt")

    default_frame_count = as_int(os.getenv("PITCH_DEFAULT_FRAME_COUNT"), fallback=24, minimum=2)
    manifest = load_manifest()
    jobs = manifest.get("jobs")
    jobs = [job for job in jobs if isinstance(job, dict)] if isinstance(jobs, list) else []
    if not jobs:
        jobs = story_jobs(default_frame_count)
        manifest["jobs"] = jobs
        print(f"animation_gen info: rebuilt empty manifest jobs from story ({len(jobs)} scenes).")

    selected_scene_ids = parse_scene_ids(os.getenv("PITCH_SCENE_IDS", ""))
    overwrite = os.getenv("PITCH_OVERWRITE", "false").strip().lower() == "true"
    if selected_scene_ids:
        jobs, unknown_ids = filter_jobs_by_scene_ids(jobs, selected_scene_ids)
        if unknown_ids and not jobs:
            rebuilt_jobs = story_jobs(default_frame_count)
            manifest["jobs"] = rebuilt_jobs
            jobs, unknown_ids = filter_jobs_by_scene_ids(rebuilt_jobs, selected_scene_ids)
            if jobs:
                print(
                    "animation_gen info: manifest scene list refreshed from story to resolve scene selection."
                )
        if unknown_ids:
            print(f"animation_gen warning: unknown scene id(s) ignored: {', '.join(unknown_ids)}")
        print(f"animation_gen scene ids: {', '.join(selected_scene_ids)}")
    else:
        print("animation_gen scene ids: all")

    needs_generation: List[Dict[str, Any]] = []
    skipped_missing_keyframes: List[Tuple[str, str]] = []
    skipped_existing_outputs: List[Tuple[str, str]] = []

    for job in jobs:
        scene_id = str(job.get("sceneId") or "unknown")
        active_video = active_video_path(job)
        job["activeVideoPath"] = str(active_video)
        job["activeVideoPathRel"] = rel_to_repo(active_video)
        job["activeVideoExists"] = active_video.exists()

        if active_video.exists() and not overwrite:
            skipped_existing_outputs.append((scene_id, rel_to_repo(active_video)))
            job["status"] = "active_video_present"
            continue

        start_path = production_start_path(job)
        end_path = production_end_path(job)

        if not start_path.exists() or not end_path.exists():
            missing_parts: List[str] = []
            if not start_path.exists():
                missing_parts.append(f"start missing ({rel_to_repo(start_path)})")
            if not end_path.exists():
                missing_parts.append(f"end missing ({rel_to_repo(end_path)})")
            skipped_missing_keyframes.append(
                (
                    scene_id,
                    ", ".join(missing_parts),
                )
            )
            job["status"] = "waiting_for_validated_keyframes"
            continue

        job["startKeyframePath"] = str(start_path)
        job["startKeyframePathRel"] = rel_to_repo(start_path)
        job["endKeyframePath"] = str(end_path)
        job["endKeyframePathRel"] = rel_to_repo(end_path)
        needs_generation.append(job)

    if skipped_missing_keyframes:
        print("animation_gen skipped scenes (missing validated production keyframes):")
        for scene_id, reason in skipped_missing_keyframes:
            print(f"- {scene_id}: {reason}")
    if skipped_existing_outputs and not overwrite:
        print("animation_gen skipped scenes (final MP4 outputs already exist, overwrite=false):")
        for scene_id, active_video_rel in skipped_existing_outputs:
            print(f"- {scene_id}: {active_video_rel}")
    if overwrite:
        print("animation_gen overwrite: true (existing final outputs are ignored for selected scenes)")

    if not needs_generation:
        print("animation_gen: nothing to do (no selected scenes are ready for animation generation).")
        manifest["updatedAt"] = utc_now_iso()
        save_manifest(manifest)
        return 0

    api_key = os.getenv("RUNWAYML_API_SECRET", "").strip()
    if not api_key:
        print("RUNWAYML_API_SECRET is required for animation_gen.")
        return 1

    api_version = os.getenv("RUNWAY_API_VERSION", "2024-11-06")
    timeout_seconds = _to_int_or_none(os.getenv("RUNWAY_POLL_TIMEOUT_SECONDS")) or 900
    http_timeout_seconds = _to_float_or_none(os.getenv("RUNWAY_HTTP_TIMEOUT_SECONDS")) or 120.0
    http_max_retries = _to_int_or_none(os.getenv("RUNWAY_HTTP_MAX_RETRIES")) or 4
    download_timeout_seconds = _to_int_or_none(os.getenv("RUNWAY_DOWNLOAD_TIMEOUT_SECONDS")) or 420
    duration_override = _to_int_or_none(os.getenv("PITCH_RUNWAY_DURATION_SECONDS"))
    if duration_override is not None and duration_override <= 0:
        duration_override = None
    if duration_override is not None:
        print(f"animation_gen duration override: {duration_override}s")
    else:
        print("animation_gen duration override: off (using per-scene/default duration)")
    print(
        "animation_gen network settings: "
        f"http_timeout={http_timeout_seconds}s "
        f"http_retries={http_max_retries} "
        f"download_timeout={download_timeout_seconds}s"
    )

    generator = RunwayVideoGenerator(
        api_key=api_key,
        api_version=api_version,
        timeout_seconds=timeout_seconds,
        http_timeout_seconds=http_timeout_seconds,
        http_max_retries=http_max_retries,
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
        duration_seconds = duration_override or (_to_int_or_none(runway_cfg.get("durationSeconds")) or 5)
        seed = _to_int_or_none(runway_cfg.get("seed"))
        public_threshold = str(runway_cfg.get("publicFigureThreshold") or "auto")
        prompt = str(runway_cfg.get("prompt") or "").strip() or _default_prompt(job)

        output_video = videos_root / scene_folder / f"{sequence_slug}.mp4"
        output_video.parent.mkdir(parents=True, exist_ok=True)
        active_video = active_video_path(job)
        active_video.parent.mkdir(parents=True, exist_ok=True)

        try:
            first_uri = _upload_ephemeral_with_retries(
                generator=generator,
                local_path=start_path,
                label=f"{scene_id} start keyframe",
                max_attempts=3,
            )
            last_uri = _upload_ephemeral_with_retries(
                generator=generator,
                local_path=end_path,
                label=f"{scene_id} end keyframe",
                max_attempts=3,
            )
            result = _generate_video_with_retries(
                generator=generator,
                model=model,
                prompt_text=prompt,
                first_frame_uri=first_uri,
                last_frame_uri=last_uri,
                ratio=ratio,
                duration_seconds=duration_seconds,
                seed=seed,
                public_figure_threshold=public_threshold,
                max_attempts=2,
            )

            job["runwayTaskId"] = result.get("task_id")
            job["runwayInputMode"] = result.get("input_mode")

            output_urls_raw = result.get("output")
            output_urls = output_urls_raw if isinstance(output_urls_raw, list) else []
            _download_video_with_retries(
                output_urls=[str(url) for url in output_urls if isinstance(url, str)],
                output_video=output_video,
                timeout_seconds=download_timeout_seconds,
                max_attempts=3,
            )
            shutil.copy2(output_video, active_video)

            job["videoPath"] = str(output_video)
            job["videoPathRel"] = rel_to_repo(output_video)
            job["activeVideoPath"] = str(active_video)
            job["activeVideoPathRel"] = rel_to_repo(active_video)
            job["activeVideoExists"] = True
            job["status"] = "video_generated"
            generated += 1
            print(
                f"animation_gen success: {scene_id} -> run {output_video} "
                f"| active {active_video} "
                f"(mode={job.get('runwayInputMode')}, task={job.get('runwayTaskId')})"
            )
        except Exception as exc:  # noqa: BLE001
            failures.append((scene_id, str(exc)))
            job["status"] = "video_failed"
            job["error"] = str(exc)
            print(f"animation_gen warning: {scene_id} failed -> {exc}")

    manifest["updatedAt"] = utc_now_iso()
    manifest["runwayRunId"] = runway_id
    manifest["runwayRunDirRel"] = rel_to_repo(videos_root.parent)
    save_manifest(manifest)

    print(f"animation_gen complete. videos generated: {generated}")

    if failures:
        print("Runway generation failures (continuing pipeline with successful scenes):")
        for scene_id, detail in failures:
            print(f"- {scene_id}: {detail}")
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
