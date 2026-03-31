from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
import os
from pathlib import Path
import subprocess
from typing import Callable, Dict, Iterable, List


StageLogger = Callable[[str], None]


@dataclass(frozen=True)
class Stage:
    key: str
    label: str
    default_command: str


STAGES: List[Stage] = [
    Stage("image_gen", "Image Gen", "python3 -u creative-pitch/pipeline/scripts/01_image_gen.py"),
    Stage(
        "animation_gen",
        "Animation Gen",
        "python3 -u creative-pitch/pipeline/scripts/02_animation_gen.py",
    ),
    Stage(
        "image_extract",
        "Image Extract",
        "python3 -u creative-pitch/pipeline/scripts/03_image_extract.py",
    ),
    Stage("upscale", "Upscale", "npm run build:creative-sequences"),
]

FINALIZE_COMMAND = "node scripts/sync-public-content.mjs"

DEFAULT_CONFIG: Dict[str, object] = {
    "defaults": {
        "frame_count": 24,
        "playback_fps": 24,
        "min_scene_seconds": 2.4,
        "scene_limit": 0,
        "scene_ids": [],
        "runway_duration_seconds": 5,
        "overwrite": False,
        "generate_start_frame": True,
        "generate_end_frame": False,
        "copy_start_to_production": False,
        "copy_end_to_production": False,
    },
    "timing": {
        "scene_padding_start": 0.06,
        "scene_padding_end": 0.05,
        "reading_words_per_second": 3.0,
        "min_text_seconds": 1.2,
        "max_text_seconds": 10.0,
        "text_transition_overlap_seconds": 0.45,
        "scroll_seconds_per_1000px": 1.6,
        "drag_seconds_per_1000px": 3.0,
        "keyboard_step_seconds": 1.1,
    },
    "render": {"webp_quality": 82, "remove_upscaled_png": True},
    "commands": {},
}


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "package.json").exists():
            return candidate
    raise RuntimeError("Could not locate repo root (missing package.json in parent chain).")


def config_path(repo_root: Path | None = None) -> Path:
    return find_repo_root(repo_root) / "creative-pitch" / "pipeline" / "config.json"


def deep_merge(base: Dict[str, object], patch: Dict[str, object]) -> Dict[str, object]:
    output: Dict[str, object] = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(output.get(key), dict):
            output[key] = deep_merge(output[key], value)  # type: ignore[arg-type]
        else:
            output[key] = value
    return output


def _normalize_config(raw: Dict[str, object] | None) -> Dict[str, object]:
    source = raw if isinstance(raw, dict) else {}
    defaults = source.get("defaults")
    timing = source.get("timing")
    render = source.get("render")
    commands = source.get("commands")

    defaults_map = defaults if isinstance(defaults, dict) else {}
    timing_map = timing if isinstance(timing, dict) else {}
    render_map = render if isinstance(render, dict) else {}
    commands_map = commands if isinstance(commands, dict) else {}
    scene_ids_raw = defaults_map.get("scene_ids")
    scene_ids: List[str] = []
    if isinstance(scene_ids_raw, list):
        seen: set[str] = set()
        for value in scene_ids_raw:
            if not isinstance(value, str):
                continue
            cleaned = value.strip()
            if not cleaned or cleaned in seen:
                continue
            scene_ids.append(cleaned)
            seen.add(cleaned)

    valid_stage_keys = {stage.key for stage in STAGES}
    normalized_commands = {
        key: str(value).strip()
        for key, value in commands_map.items()
        if key in valid_stage_keys and isinstance(value, str)
    }

    return {
        "defaults": {
            "frame_count": max(2, _coerce_num(defaults_map.get("frame_count", 24), 24)),
            "playback_fps": max(1, _coerce_num(defaults_map.get("playback_fps", 24), 24)),
            "min_scene_seconds": max(
                0.4, _coerce_float(defaults_map.get("min_scene_seconds", 2.4), 2.4)
            ),
            "scene_limit": max(0, _coerce_num(defaults_map.get("scene_limit", 0), 0)),
            "scene_ids": scene_ids,
            "runway_duration_seconds": max(
                2, min(10, _coerce_num(defaults_map.get("runway_duration_seconds", 5), 5))
            ),
            "overwrite": bool(defaults_map.get("overwrite", False)),
            "generate_start_frame": bool(defaults_map.get("generate_start_frame", True)),
            "generate_end_frame": bool(defaults_map.get("generate_end_frame", False)),
            "copy_start_to_production": bool(defaults_map.get("copy_start_to_production", False)),
            "copy_end_to_production": bool(defaults_map.get("copy_end_to_production", False)),
        },
        "timing": {
            "scene_padding_start": max(
                0.0, min(0.45, _coerce_float(timing_map.get("scene_padding_start", 0.06), 0.06))
            ),
            "scene_padding_end": max(
                0.0, min(0.45, _coerce_float(timing_map.get("scene_padding_end", 0.05), 0.05))
            ),
            "reading_words_per_second": max(
                0.8,
                _coerce_float(timing_map.get("reading_words_per_second", 3.0), 3.0),
            ),
            "min_text_seconds": max(
                0.3, _coerce_float(timing_map.get("min_text_seconds", 1.2), 1.2)
            ),
            "max_text_seconds": max(
                0.5, _coerce_float(timing_map.get("max_text_seconds", 10.0), 10.0)
            ),
            "text_transition_overlap_seconds": max(
                0.0,
                _coerce_float(
                    timing_map.get("text_transition_overlap_seconds", 0.45),
                    0.45,
                ),
            ),
            "scroll_seconds_per_1000px": max(
                0.2,
                _coerce_float(timing_map.get("scroll_seconds_per_1000px", 1.6), 1.6),
            ),
            "drag_seconds_per_1000px": max(
                0.2,
                _coerce_float(timing_map.get("drag_seconds_per_1000px", 3.0), 3.0),
            ),
            "keyboard_step_seconds": max(
                0.05,
                _coerce_float(timing_map.get("keyboard_step_seconds", 1.1), 1.1),
            ),
        },
        "render": {
            "webp_quality": max(1, min(100, _coerce_num(render_map.get("webp_quality", 82), 82))),
            "remove_upscaled_png": bool(render_map.get("remove_upscaled_png", True)),
        },
        "commands": normalized_commands,
    }


def load_config(repo_root: Path | None = None) -> Dict[str, object]:
    path = config_path(repo_root)
    if not path.exists():
        return json.loads(json.dumps(DEFAULT_CONFIG))
    with path.open("r", encoding="utf-8") as file:
        raw = json.load(file)
    if not isinstance(raw, dict):
        return json.loads(json.dumps(DEFAULT_CONFIG))
    return _normalize_config(deep_merge(DEFAULT_CONFIG, raw))


def save_config(config: Dict[str, object], repo_root: Path | None = None) -> Path:
    normalized = _normalize_config(config)
    path = config_path(repo_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(normalized, file, indent=2)
        file.write("\n")
    return path


def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _log(logger: StageLogger, message: str) -> None:
    logger(f"[{_ts()}] {message}")


def _resolve_command(stage_key: str, config: Dict[str, object]) -> str:
    command_overrides = config.get("commands")
    if isinstance(command_overrides, dict):
        override = command_overrides.get(stage_key)
        if isinstance(override, str):
            return override.strip()
    for stage in STAGES:
        if stage.key == stage_key:
            return stage.default_command
    return ""


def _coerce_num(raw: object, fallback: int) -> int:
    try:
        value = int(float(raw))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return fallback
    return value


def _coerce_float(raw: object, fallback: float) -> float:
    try:
        value = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return fallback
    return value


def _run_command(
    command: str,
    stage_key: str,
    repo_root: Path,
    env: Dict[str, str],
    logger: StageLogger,
) -> int:
    process = subprocess.Popen(
        command,
        shell=True,
        cwd=str(repo_root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert process.stdout is not None
    for line in process.stdout:
        logger(f"[{stage_key}] {line.rstrip()}")
    return process.wait()


def run_pipeline(
    selected_stages: Iterable[str],
    config: Dict[str, object] | None = None,
    repo_root: Path | None = None,
    logger: StageLogger = print,
) -> Dict[str, object]:
    root = find_repo_root(repo_root)
    merged_config = _normalize_config(deep_merge(load_config(root), config or {}))
    saved_path = save_config(merged_config, root)

    defaults = merged_config.get("defaults", {})
    render = merged_config.get("render", {})

    defaults_map = defaults if isinstance(defaults, dict) else {}
    render_map = render if isinstance(render, dict) else {}

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PITCH_DEFAULT_FRAME_COUNT"] = str(
        _coerce_num(defaults_map.get("frame_count", 24), 24)
    )
    env["PITCH_SCENE_LIMIT"] = str(max(0, _coerce_num(defaults_map.get("scene_limit", 0), 0)))
    scene_ids = defaults_map.get("scene_ids")
    scene_ids_list = scene_ids if isinstance(scene_ids, list) else []
    env["PITCH_SCENE_IDS"] = ",".join(
        str(item).strip()
        for item in scene_ids_list
        if isinstance(item, str) and str(item).strip()
    )
    env["PITCH_IMAGE_GEN_RUN_START"] = (
        "true" if bool(defaults_map.get("generate_start_frame", True)) else "false"
    )
    env["PITCH_IMAGE_GEN_RUN_END"] = (
        "true" if bool(defaults_map.get("generate_end_frame", False)) else "false"
    )
    env["PITCH_OVERWRITE"] = "true" if bool(defaults_map.get("overwrite", False)) else "false"
    env["PITCH_COPY_START_TO_PRODUCTION"] = (
        "true" if bool(defaults_map.get("copy_start_to_production", False)) else "false"
    )
    env["PITCH_COPY_END_TO_PRODUCTION"] = (
        "true" if bool(defaults_map.get("copy_end_to_production", False)) else "false"
    )
    env["PITCH_RUNWAY_DURATION_SECONDS"] = str(
        max(2, min(10, _coerce_num(defaults_map.get("runway_duration_seconds", 5), 5)))
    )
    env["WEBP_QUALITY"] = str(_coerce_num(render_map.get("webp_quality", 82), 82))
    remove_png = bool(render_map.get("remove_upscaled_png", True))
    env["REMOVE_UPSCALED_PNG"] = "true" if remove_png else "false"

    selected = [stage.key for stage in STAGES if stage.key in set(selected_stages)]
    results: Dict[str, object] = {"selected_stages": selected, "status": "ok", "stages": []}

    _log(logger, f"Saved config: {saved_path}")
    _log(
        logger,
        f"Runtime settings: PITCH_SCENE_LIMIT={env['PITCH_SCENE_LIMIT']} "
        f"PITCH_SCENE_IDS={env['PITCH_SCENE_IDS'] or 'all'} "
        f"PITCH_IMAGE_GEN_RUN_START={env['PITCH_IMAGE_GEN_RUN_START']} "
        f"PITCH_IMAGE_GEN_RUN_END={env['PITCH_IMAGE_GEN_RUN_END']} "
        f"PITCH_OVERWRITE={env['PITCH_OVERWRITE']} "
        f"PITCH_COPY_START_TO_PRODUCTION={env['PITCH_COPY_START_TO_PRODUCTION']} "
        f"PITCH_COPY_END_TO_PRODUCTION={env['PITCH_COPY_END_TO_PRODUCTION']} "
        f"PITCH_RUNWAY_DURATION_SECONDS={env['PITCH_RUNWAY_DURATION_SECONDS']} "
        f"WEBP_QUALITY={env['WEBP_QUALITY']} REMOVE_UPSCALED_PNG={env['REMOVE_UPSCALED_PNG']}",
    )

    for stage_key in selected:
        command = _resolve_command(stage_key, merged_config)
        if not command:
            message = (
                f"{stage_key}: failed (no command configured). "
                f"Set commands.{stage_key} in creative-pitch/pipeline/config.json"
            )
            _log(logger, message)
            results["stages"].append(
                {"stage": stage_key, "status": "failed", "reason": "no_command_configured"}
            )
            results["status"] = "failed"
            return results

        _log(logger, f"{stage_key}: starting -> {command}")
        code = _run_command(command, stage_key, root, env, logger)
        if code != 0:
            _log(logger, f"{stage_key}: failed (exit {code})")
            results["stages"].append({"stage": stage_key, "status": "failed", "exit_code": code})
            results["status"] = "failed"
            return results

        _log(logger, f"{stage_key}: complete")
        results["stages"].append({"stage": stage_key, "status": "ok"})

    _log(logger, f"finalize: starting -> {FINALIZE_COMMAND}")
    finalize_code = _run_command(FINALIZE_COMMAND, "finalize", root, env, logger)
    if finalize_code != 0:
        _log(logger, f"finalize: failed (exit {finalize_code})")
        results["stages"].append({"stage": "finalize", "status": "failed", "exit_code": finalize_code})
        results["status"] = "failed"
        return results

    _log(logger, "finalize: complete")
    results["stages"].append({"stage": "finalize", "status": "ok"})
    return results
