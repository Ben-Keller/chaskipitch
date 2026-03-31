from __future__ import annotations

import argparse
import sys

from pipeline_backend import STAGES, load_config, run_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run creative-pitch pipeline stages.")
    parser.add_argument(
        "--stages",
        nargs="+",
        default=[stage.key for stage in STAGES],
        help=f"Stage keys to run (default all): {', '.join(stage.key for stage in STAGES)}",
    )
    parser.add_argument("--frame-count", type=int, help="Override defaults.frame_count in config.")
    parser.add_argument(
        "--scene-limit",
        type=int,
        help="Override defaults.scene_limit in config (0 means all scenes).",
    )
    parser.add_argument(
        "--skip-start-frame",
        action="store_true",
        help="Disable start frame generation in image_gen.",
    )
    parser.add_argument(
        "--run-start-frame",
        action="store_true",
        help="Enable start frame generation in image_gen.",
    )
    parser.add_argument(
        "--skip-end-frame",
        action="store_true",
        help="Disable end frame generation in image_gen.",
    )
    parser.add_argument(
        "--run-end-frame",
        action="store_true",
        help="Enable end frame generation in image_gen.",
    )
    parser.add_argument(
        "--copy-start-to-production",
        action="store_true",
        help="After start generation, copy generated starts to production start folder.",
    )
    parser.add_argument(
        "--copy-end-to-production",
        action="store_true",
        help="After end generation, copy generated ends to production end folder.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Regenerate selected scenes even if final outputs already exist.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    config = load_config()
    if args.frame_count is not None:
        config.setdefault("defaults", {})["frame_count"] = args.frame_count
    if args.scene_limit is not None:
        config.setdefault("defaults", {})["scene_limit"] = max(0, args.scene_limit)
    if args.skip_start_frame:
        config.setdefault("defaults", {})["generate_start_frame"] = False
    if args.run_start_frame:
        config.setdefault("defaults", {})["generate_start_frame"] = True
    if args.skip_end_frame:
        config.setdefault("defaults", {})["generate_end_frame"] = False
    if args.run_end_frame:
        config.setdefault("defaults", {})["generate_end_frame"] = True
    if args.copy_start_to_production:
        config.setdefault("defaults", {})["copy_start_to_production"] = True
    if args.copy_end_to_production:
        config.setdefault("defaults", {})["copy_end_to_production"] = True
    if args.overwrite:
        config.setdefault("defaults", {})["overwrite"] = True

    result = run_pipeline(args.stages, config=config)
    return 0 if result.get("status") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
