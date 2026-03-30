from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import subprocess
from typing import Any, Dict, List, Optional, Tuple
import urllib.error
import urllib.request
import uuid

SUPPORTED_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")


class PipelineError(RuntimeError):
    pass


def find_repo_root(start: Optional[Path] = None) -> Path:
    current = (start or Path(__file__).resolve()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "package.json").exists():
            return candidate
    raise PipelineError("Could not locate repo root (missing package.json in parent chain).")


REPO_ROOT = find_repo_root()
CREATIVE_ROOT = REPO_ROOT / "creative-pitch"
PIPELINE_ROOT = CREATIVE_ROOT / "pipeline"
STORY_PATH = CREATIVE_ROOT / "story.json"
ASSET_ROOT = CREATIVE_ROOT / "assets"
RUNS_ROOT = PIPELINE_ROOT / "runs"
OUTPUT_ROOT = PIPELINE_ROOT / "output"
GENERATED_ROOT = PIPELINE_ROOT / "generated"
MANIFEST_PATH = GENERATED_ROOT / "manifests" / "sequence_jobs.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def run_id(prefix: str) -> str:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{prefix}-{stamp}"


def rel_to_repo(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT).as_posix()


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def as_int(value: Any, fallback: int, minimum: int = 1) -> int:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        return max(minimum, fallback)
    return max(minimum, numeric)


def load_story() -> Dict[str, Any]:
    if not STORY_PATH.exists():
        raise PipelineError(f"Story file not found: {STORY_PATH}")
    with STORY_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise PipelineError("creative-pitch/story.json must be a JSON object.")
    return payload


def load_manifest() -> Dict[str, Any]:
    if not MANIFEST_PATH.exists():
        raise PipelineError(
            "Sequence manifest is missing. Run image_gen first to build generated/manifests/sequence_jobs.json"
        )
    with MANIFEST_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise PipelineError(f"Invalid manifest JSON at {MANIFEST_PATH}")
    return payload


def save_manifest(payload: Dict[str, Any]) -> Path:
    ensure_dir(MANIFEST_PATH.parent)
    with MANIFEST_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    return MANIFEST_PATH


def resolve_asset_frame_pattern(src_pattern: str) -> Path:
    if not isinstance(src_pattern, str) or not src_pattern.strip():
        raise PipelineError("scene.media.srcPattern must be a non-empty string.")
    trimmed = src_pattern.strip()
    if not trimmed.startswith("/assets/"):
        raise PipelineError(
            f"scene.media.srcPattern must start with '/assets/': received '{src_pattern}'"
        )
    return (CREATIVE_ROOT / trimmed.lstrip("/")).resolve()


def list_active_webp_frames(asset_dir: Path) -> List[Path]:
    if not asset_dir.exists():
        return []
    return sorted(asset_dir.glob("frame_*.webp"))


def find_keyframe_file(base_dir: Path, basename: str) -> Optional[Path]:
    for ext in SUPPORTED_IMAGE_EXTS:
        candidate = base_dir / f"{basename}{ext}"
        if candidate.exists():
            return candidate
    return None


def _pick_first(mapping: Dict[str, Any], keys: List[str], fallback: str = "") -> str:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return fallback


def _scene_text_description(scene: Dict[str, Any]) -> str:
    texts = scene.get("texts")
    if not isinstance(texts, list):
        return ""
    parts: List[str] = []
    for entry in texts:
        if not isinstance(entry, dict):
            continue
        content = entry.get("content")
        if isinstance(content, str):
            cleaned = " ".join(content.split())
            if cleaned:
                parts.append(cleaned)
    return " ".join(parts).strip()


def story_jobs(default_frame_count: int) -> List[Dict[str, Any]]:
    story = load_story()
    scenes = story.get("scenes")
    if not isinstance(scenes, list):
        raise PipelineError("creative-pitch/story.json must include a scenes array.")

    jobs: List[Dict[str, Any]] = []
    for scene_index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            continue

        media = scene.get("media")
        if not isinstance(media, dict):
            continue

        src_pattern = media.get("srcPattern")
        if not isinstance(src_pattern, str) or not src_pattern.strip():
            continue

        frame_pattern_path = resolve_asset_frame_pattern(src_pattern)
        asset_dir = frame_pattern_path.parent
        active_webp = list_active_webp_frames(asset_dir)

        sequence_slug = asset_dir.name
        scene_folder = asset_dir.parent.parent.name if len(asset_dir.parents) >= 2 else str(scene.get("id", "scene"))
        keyframe_source_dir = PIPELINE_ROOT / "frames" / "source" / scene_folder / sequence_slug

        generation_raw = media.get("generation")
        generation = generation_raw if isinstance(generation_raw, dict) else {}
        openai_raw = generation.get("openai")
        runway_raw = generation.get("runway")
        openai_cfg = openai_raw if isinstance(openai_raw, dict) else {}
        runway_cfg = runway_raw if isinstance(runway_raw, dict) else {}

        frame_count = as_int(media.get("frameCount"), default_frame_count, minimum=2)

        job = {
            "sceneId": str(scene.get("id") or f"SCENE_{scene_index + 1}"),
            "sceneTitle": str(scene.get("title") or ""),
            "sceneDescription": _scene_text_description(scene),
            "sceneOrder": scene_index + 1,
            "sceneFolder": scene_folder,
            "sequenceSlug": sequence_slug,
            "srcPattern": src_pattern,
            "assetDir": str(asset_dir),
            "assetDirRel": rel_to_repo(asset_dir),
            "frameCount": frame_count,
            "activeWebpCount": len(active_webp),
            "manualKeyframeDir": str(keyframe_source_dir),
            "manualKeyframeDirRel": rel_to_repo(keyframe_source_dir),
            "startKeyframePath": None,
            "endKeyframePath": None,
            "videoPath": None,
            "videoPathRel": None,
            "extractPatternPng": str(frame_pattern_path.with_suffix(".png")),
            "extractPatternPngRel": rel_to_repo(frame_pattern_path.with_suffix(".png")),
            "status": "pending",
            "openai": {
                "model": _pick_first(openai_cfg, ["model"], "gpt-image-1"),
                "size": _pick_first(openai_cfg, ["size"], "1536x1024"),
                "quality": _pick_first(openai_cfg, ["quality"], "low"),
                "style": _pick_first(openai_cfg, ["style"], "natural"),
            },
            "runway": {
                "model": _pick_first(runway_cfg, ["model"], _pick_first(generation, ["runwayModel", "runway_model"], "gen4.5")),
                "ratio": _pick_first(runway_cfg, ["ratio"], _pick_first(generation, ["runwayRatio", "runway_ratio"], "1280:720")),
                "durationSeconds": as_int(
                    runway_cfg.get("durationSeconds", generation.get("durationSeconds", 5)),
                    fallback=5,
                    minimum=2,
                ),
                "seed": runway_cfg.get("seed", generation.get("seed")),
                "publicFigureThreshold": _pick_first(
                    runway_cfg,
                    ["publicFigureThreshold", "public_figure_threshold"],
                    _pick_first(generation, ["publicFigureThreshold", "public_figure_threshold"], "auto"),
                ),
                "prompt": _pick_first(
                    runway_cfg,
                    ["prompt", "promptText", "prompt_text"],
                    _pick_first(generation, ["animationPrompt", "animation_prompt", "runwayPrompt", "runway_prompt"]),
                ),
            },
        }

        jobs.append(job)

    if not jobs:
        raise PipelineError("No scenes with media.srcPattern were found in creative-pitch/story.json")
    return jobs


def probe_duration(ffmpeg_path: str, video_path: Path) -> float:
    ffprobe_path = ffmpeg_path.replace("ffmpeg", "ffprobe") if "ffmpeg" in ffmpeg_path else "ffprobe"
    command = [
        ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise PipelineError(result.stderr.strip() or f"ffprobe failed for {video_path}")
    try:
        return max(float(result.stdout.strip()), 0.0001)
    except ValueError as exc:
        raise PipelineError(f"Could not parse video duration for {video_path}") from exc


def extract_exact_frame_count(
    *,
    ffmpeg_path: str,
    video_path: Path,
    output_pattern: Path,
    frame_count: int,
    overwrite: bool = True,
) -> None:
    ensure_dir(output_pattern.parent)
    fps_expr = f"fps={frame_count}/{probe_duration(ffmpeg_path, video_path):.6f}"
    command = [
        ffmpeg_path,
        "-y" if overwrite else "-n",
        "-i",
        str(video_path),
        "-vf",
        fps_expr,
        str(output_pattern),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise PipelineError(result.stderr.strip() or f"ffmpeg failed for {video_path}")


def extract_all_video_frames(
    *,
    ffmpeg_path: str,
    video_path: Path,
    output_pattern: Path,
    overwrite: bool = True,
) -> None:
    ensure_dir(output_pattern.parent)
    command = [
        ffmpeg_path,
        "-y" if overwrite else "-n",
        "-i",
        str(video_path),
        "-vsync",
        "0",
        str(output_pattern),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise PipelineError(result.stderr.strip() or f"ffmpeg failed for {video_path}")


def _extract_unknown_parameter(detail: str) -> str | None:
    try:
        error_payload = json.loads(detail)
    except json.JSONDecodeError:
        return None
    if not isinstance(error_payload, dict):
        return None
    error_obj = error_payload.get("error")
    if not isinstance(error_obj, dict):
        return None
    code = error_obj.get("code")
    param = error_obj.get("param")
    if code == "unknown_parameter" and isinstance(param, str):
        return param
    return None


def _extract_error_object(detail: str) -> Dict[str, Any] | None:
    try:
        payload = json.loads(detail)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    error_obj = payload.get("error")
    if not isinstance(error_obj, dict):
        return None
    return error_obj


def _extract_invalid_value(detail: str) -> Tuple[str, str] | None:
    error_obj = _extract_error_object(detail)
    if not isinstance(error_obj, dict):
        return None
    code = error_obj.get("code")
    param = error_obj.get("param")
    message = error_obj.get("message")
    if code == "invalid_value" and isinstance(param, str) and isinstance(message, str):
        return (param, message)
    return None


def _parse_json_object_from_text(text: str) -> Dict[str, Any] | None:
    raw = (text or "").strip()
    if not raw:
        return None
    try:
        payload = json.loads(raw)
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        snippet = raw[start : end + 1]
        try:
            payload = json.loads(snippet)
            return payload if isinstance(payload, dict) else None
        except json.JSONDecodeError:
            return None
    return None


VARIANT_PROFILES: List[str] = [
    "Ultra close-up macro composition, shallow depth of field, photoreal documentary texture, low-angle viewpoint.",
    "Wide establishing shot from elevated aerial perspective, expansive environment context, crisp geographic depth.",
    "Eye-level medium-wide frame, cinematic anamorphic look, naturalistic color grade, balanced composition.",
    "Top-down overhead composition, graphic geometry emphasis, clean structural layout, strong negative space.",
    "Painterly illustrative treatment with visible brush texture, stylized color harmonies, art-directed composition.",
    "High-contrast monochrome film look, dramatic side lighting, moody tonal separation, classic documentary aesthetic.",
    "Atmospheric fog-rich scene with volumetric light shafts, dreamy diffusion, soft cinematic palette.",
    "Infrared-inspired false-color scientific visualization style, high micro-detail texture, analytical visual language.",
]


def _profile_for_index(index: int) -> str:
    return VARIANT_PROFILES[index % len(VARIANT_PROFILES)]


def _token_set(text: str) -> set[str]:
    chars = []
    for char in text.lower():
        chars.append(char if char.isalnum() else " ")
    return {token for token in "".join(chars).split() if token}


def _jaccard_similarity(a: str, b: str) -> float:
    set_a = _token_set(a)
    set_b = _token_set(b)
    if not set_a and not set_b:
        return 1.0
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / max(1, len(set_a | set_b))


def _ensure_prompt_diversity(prompts: List[str], count: int, base_prompt: str) -> List[str]:
    output: List[str] = []
    for index in range(count):
        candidate = prompts[index].strip() if index < len(prompts) else ""
        profile = _profile_for_index(index)
        if not candidate:
            candidate = base_prompt.strip()
        enriched = (
            f"Variation profile ({index + 1}/{count}): {profile}\n"
            "Recompose the scene to clearly reflect this profile while preserving core subject and narrative intent.\n"
            f"{candidate}"
        )

        too_similar = any(_jaccard_similarity(enriched, existing) >= 0.8 for existing in output)
        if too_similar:
            enriched = (
                f"Variation profile ({index + 1}/{count}): {profile}\n"
                "Make this variation clearly different in viewpoint and rendering style from other variants.\n"
                f"{base_prompt.strip()}"
            )
        output.append(enriched)

    return output


def openai_generate_prompt_variants(
    *,
    api_key: str,
    base_prompt: str,
    variant_count: int,
    model: str = "gpt-4o-mini",
) -> List[str]:
    count = max(1, int(variant_count))
    if count == 1:
        return [base_prompt.strip()]

    endpoint = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    profile_lines = [
        f"{index + 1}. {_profile_for_index(index)}"
        for index in range(count)
    ]
    system_prompt = (
        "You generate image prompt variants for storyboarding. "
        "Return strict JSON only, with shape: {\"prompts\":[...]} and exactly the requested count. "
        "All prompts must preserve the same core subject and story intent as the base prompt, "
        "but each variant must be significantly different in camera viewpoint and visual style. "
        "No markdown."
    )
    user_prompt = (
        f"Base prompt:\\n{base_prompt}\\n\\n"
        f"Generate {count} variants for OpenAI image generation.\\n"
        "Each variant must follow its profile below and must look materially different from the others:\\n"
        + "\\n".join(profile_lines)
    )

    payload: Dict[str, Any] = {
        "model": model,
        "temperature": 0.95,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
    }

    parsed: Dict[str, Any] | None = None
    for _ in range(3):
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                parsed = json.loads(response.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            unknown_param = _extract_unknown_parameter(detail)
            if exc.code == 400 and unknown_param and unknown_param in payload:
                payload.pop(unknown_param, None)
                continue
            raise PipelineError(f"OpenAI prompt variation failed ({exc.code}): {detail}") from exc
        except urllib.error.URLError as exc:
            raise PipelineError(f"OpenAI prompt variation failed: {exc}") from exc

    if not isinstance(parsed, dict):
        raise PipelineError("OpenAI prompt variation failed: empty response payload.")

    choices = parsed.get("choices")
    if not isinstance(choices, list) or not choices:
        raise PipelineError("OpenAI prompt variation response was missing choices[].")

    first = choices[0]
    if not isinstance(first, dict):
        raise PipelineError("OpenAI prompt variation response contained invalid choices[0].")

    message = first.get("message")
    if not isinstance(message, dict):
        raise PipelineError("OpenAI prompt variation response was missing message.")

    content = message.get("content")
    if not isinstance(content, str):
        raise PipelineError("OpenAI prompt variation response message.content was not a string.")

    parsed_content = _parse_json_object_from_text(content)
    if not isinstance(parsed_content, dict):
        raise PipelineError("OpenAI prompt variation response content was not valid JSON.")

    prompts_raw = parsed_content.get("prompts")
    if not isinstance(prompts_raw, list):
        raise PipelineError("OpenAI prompt variation JSON missing prompts array.")

    prompts: List[str] = []
    seen = set()
    for item in prompts_raw:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text:
            continue
        if text in seen:
            continue
        prompts.append(text)
        seen.add(text)
        if len(prompts) >= count:
            break

    return _ensure_prompt_diversity(prompts, count, base_prompt)


def openai_generate_image(
    *,
    api_key: str,
    prompt: str,
    output_path: Path,
    model: str,
    size: str,
    quality: str,
    style: str,
) -> None:
    if not prompt.strip():
        raise PipelineError("OpenAI prompt cannot be empty.")

    ensure_dir(output_path.parent)
    endpoint = "https://api.openai.com/v1/images/generations"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "response_format": "b64_json",
    }
    if style and "dall-e" in model.lower():
        payload["style"] = style

    parsed: Dict[str, Any] | None = None
    for _ in range(4):
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                parsed = json.loads(response.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            unknown_param = _extract_unknown_parameter(detail)

            if exc.code == 400 and unknown_param and unknown_param in payload:
                payload.pop(unknown_param, None)
                continue

            raise PipelineError(f"OpenAI image generation failed ({exc.code}): {detail}") from exc
        except urllib.error.URLError as exc:
            raise PipelineError(f"OpenAI image generation failed: {exc}") from exc

    if not isinstance(parsed, dict):
        raise PipelineError("OpenAI image generation failed: empty response payload.")

    data = parsed.get("data")
    if not isinstance(data, list) or not data:
        raise PipelineError("OpenAI image response was missing data[].")

    first = data[0]
    if not isinstance(first, dict):
        raise PipelineError("OpenAI image response contained invalid data[0].")

    b64_payload = first.get("b64_json")
    image_url = first.get("url")

    if isinstance(b64_payload, str) and b64_payload:
        output_path.write_bytes(base64.b64decode(b64_payload))
        return

    if isinstance(image_url, str) and image_url:
        with urllib.request.urlopen(image_url, timeout=240) as response:
            output_path.write_bytes(response.read())
        return

    raise PipelineError("OpenAI image response did not contain b64_json or url.")


def _multipart_form_data(
    fields: Dict[str, str],
    files: List[Tuple[str, str, bytes, str]],
) -> Tuple[bytes, str]:
    boundary = f"----codex-{uuid.uuid4().hex}"
    chunks: List[bytes] = []

    for key, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        chunks.append(value.encode("utf-8"))
        chunks.append(b"\r\n")

    for field_name, filename, content, content_type in files:
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            (
                f'Content-Disposition: form-data; name="{field_name}"; '
                f'filename="{filename}"\r\n'
            ).encode("utf-8")
        )
        chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        chunks.append(content)
        chunks.append(b"\r\n")

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(chunks)
    return body, f"multipart/form-data; boundary={boundary}"


def _prepare_dalle2_edit_input(input_image_path: Path, output_dir: Path) -> Path:
    output_path = output_dir / f"{input_image_path.stem}_dalle2_input.png"
    output_dir.mkdir(parents=True, exist_ok=True)

    commands = [
        [
            "ffmpeg",
            "-y",
            "-i",
            str(input_image_path),
            "-vf",
            "scale=1024:1024:force_original_aspect_ratio=decrease,"
            "pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=black",
            "-frames:v",
            "1",
            "-compression_level",
            "9",
            str(output_path),
        ],
        [
            "ffmpeg",
            "-y",
            "-i",
            str(input_image_path),
            "-frames:v",
            "1",
            str(output_path),
        ],
    ]

    for command in commands:
        try:
            result = subprocess.run(command, capture_output=True, text=True)
        except FileNotFoundError:
            continue
        if result.returncode == 0 and output_path.exists():
            return output_path

    if input_image_path.suffix.lower() == ".png":
        output_path.write_bytes(input_image_path.read_bytes())
        return output_path

    raise PipelineError(
        "Could not prepare a PNG edit input for DALL-E 2. "
        "Install ffmpeg and retry image_gen."
    )


def openai_generate_image_edit(
    *,
    api_key: str,
    prompt: str,
    input_image_path: Path,
    output_path: Path,
    model: str,
    size: str,
    quality: str,
) -> None:
    if not prompt.strip():
        raise PipelineError("OpenAI edit prompt cannot be empty.")
    if not input_image_path.exists():
        raise PipelineError(f"OpenAI edit input image does not exist: {input_image_path}")

    ensure_dir(output_path.parent)
    endpoint = "https://api.openai.com/v1/images/edits"
    base_headers = {
        "Authorization": f"Bearer {api_key}",
    }

    fields: Dict[str, str] = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "response_format": "b64_json",
    }

    parsed: Dict[str, Any] | None = None
    request_image_path = input_image_path
    for _ in range(8):
        body, content_type = _multipart_form_data(
            fields,
            [
                (
                    "image",
                    request_image_path.name,
                    request_image_path.read_bytes(),
                    "image/png",
                )
            ],
        )
        headers = dict(base_headers)
        headers["Content-Type"] = content_type
        request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                parsed = json.loads(response.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            unknown_param = _extract_unknown_parameter(detail)
            if exc.code == 400 and unknown_param and unknown_param in fields:
                fields.pop(unknown_param, None)
                continue
            invalid_value = _extract_invalid_value(detail)
            if exc.code == 400 and invalid_value:
                param, message = invalid_value
                if param == "model" and "dall-e-2" in message.lower():
                    fields["model"] = "dall-e-2"
                    fields.pop("quality", None)
                    if fields.get("size") not in {"256x256", "512x512", "1024x1024"}:
                        fields["size"] = "1024x1024"
                    request_image_path = _prepare_dalle2_edit_input(input_image_path, output_path.parent)
                    continue
                if param == "size":
                    fields["size"] = "1024x1024"
                    continue
                if param == "quality" and "quality" in fields:
                    fields.pop("quality", None)
                    continue
            if exc.code == 400 and "square" in detail.lower():
                request_image_path = _prepare_dalle2_edit_input(input_image_path, output_path.parent)
                if fields.get("model", "").lower() != "dall-e-2":
                    fields["model"] = "dall-e-2"
                fields.pop("quality", None)
                fields["size"] = "1024x1024"
                continue
            raise PipelineError(f"OpenAI image edit failed ({exc.code}): {detail}") from exc
        except urllib.error.URLError as exc:
            raise PipelineError(f"OpenAI image edit failed: {exc}") from exc

    if not isinstance(parsed, dict):
        raise PipelineError("OpenAI image edit failed: empty response payload.")

    data = parsed.get("data")
    if not isinstance(data, list) or not data:
        raise PipelineError("OpenAI image edit response was missing data[].")

    first = data[0]
    if not isinstance(first, dict):
        raise PipelineError("OpenAI image edit response contained invalid data[0].")

    b64_payload = first.get("b64_json")
    image_url = first.get("url")

    if isinstance(b64_payload, str) and b64_payload:
        output_path.write_bytes(base64.b64decode(b64_payload))
        return

    if isinstance(image_url, str) and image_url:
        with urllib.request.urlopen(image_url, timeout=240) as response:
            output_path.write_bytes(response.read())
        return

    raise PipelineError("OpenAI image edit response did not contain b64_json or url.")


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise PipelineError(f"Missing required environment variable: {name}")
    return value


def summarize_missing(missing: List[Tuple[str, str]]) -> str:
    lines = ["Missing required generation inputs:"]
    for scene_id, reason in missing:
        lines.append(f"- {scene_id}: {reason}")
    return "\n".join(lines)
