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
        "--start-variants",
        type=int,
        help="Override defaults.start_frame_variants in config (image_gen).",
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
    parser.add_argument("--webp-quality", type=int, help="Override render.webp_quality in config.")
    parser.add_argument(
        "--keep-png",
        action="store_true",
        help="Keep source PNGs (sets render.remove_upscaled_png=false).",
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
    if args.start_variants is not None:
        config.setdefault("defaults", {})["start_frame_variants"] = max(1, args.start_variants)
    if args.skip_start_frame:
        config.setdefault("defaults", {})["generate_start_frame"] = False
    if args.run_start_frame:
        config.setdefault("defaults", {})["generate_start_frame"] = True
    if args.skip_end_frame:
        config.setdefault("defaults", {})["generate_end_frame"] = False
    if args.run_end_frame:
        config.setdefault("defaults", {})["generate_end_frame"] = True
    if args.webp_quality is not None:
        config.setdefault("render", {})["webp_quality"] = args.webp_quality
    if args.keep_png:
        config.setdefault("render", {})["remove_upscaled_png"] = False

    result = run_pipeline(args.stages, config=config)
    return 0 if result.get("status") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
