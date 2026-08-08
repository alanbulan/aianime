"""Voxel world generation subprocess adapter."""

from __future__ import annotations

import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ai_anime.modules.asset_world.infrastructure.director_world import (
    block_world_builder,
    stage_manifest,
)
from ai_anime.modules.asset_world.infrastructure.director_world.paths import (
    safe_name,
    world_path,
)
from ai_anime.modules.task_execution.public import run_project_model_subprocess
from ai_anime.shared.utils.path_resolver import compute_scene_spatial_layout_path

logger = logging.getLogger(__name__)


def _with_pano_voxel_ref_instructions(description: str) -> str:
    return "\n\n".join(
        [
            description.strip(),
            "参考图来源：REFERENCE 1 是 spatial_layout.png。不要使用 360 四视图作为模型输入。",
            "参考图顺序：spatial_layout。",
            (
                "REFERENCE 1 spatial_layout.png 是 TOP-DOWN / FLOOR PLAN / 俯视平面布局图。"
                "它不是透视照片、不是相机视角、不是墙面立面图。"
                "请把图中 2D 平面位置解释为 voxel world 的 X/Z 地面坐标；"
                "垂直高度 Y 由物体类别推断。"
            ),
            (
                "房间边界、门窗、柜台、桌椅组、通道、固定物件的相对位置和数量"
                "优先服从 spatial_layout.png。"
            ),
            (
                "请生成语义 voxel world.json：保持主要固定物件的相对位置和可编辑性，"
                "不要放人物、剧情动作或临时道具。"
            ),
        ]
    )


def _compress_model_reference(
    source_path: Path,
    output_dir: Path,
    *,
    max_side: int = 960,
    jpeg_quality: int = 72,
) -> Path:
    """Write a compact JPEG copy for multimodal model submission."""
    from PIL import Image

    source_path = Path(source_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    target_path = output_dir / f"{source_path.stem}.model_ref.jpg"
    with Image.open(source_path) as image:
        image = image.convert("RGB")
        width, height = image.size
        longest = max(width, height)
        if max_side > 0 and longest > max_side:
            scale = max_side / longest
            image = image.resize(
                (max(1, int(round(width * scale))), max(1, int(round(height * scale)))),
                Image.Resampling.LANCZOS,
            )
        image.save(
            target_path,
            format="JPEG",
            quality=max(40, min(95, int(jpeg_quality))),
            optimize=True,
        )
    return target_path


def run_voxel_world_from_360(
    project_dir: Path,
    scene_id: str,
    *,
    description: str = "",
    max_blocks: int = 80_000,
    max_abs_coord: int = 96,
    max_y: int = 64,
    timeout_seconds: int = 1800,
    progress_callback: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """Generate legacy DirectorWorld `world.json` from the scene spatial layout.

    This is intentionally synchronous and UI-free. It runs inside a task worker,
    compresses spatial_layout.png, then calls the block-world generator.
    """

    def report(progress: float, message: str) -> None:
        if progress_callback:
            progress_callback(progress, message)

    project_dir = Path(project_dir)
    spatial_layout_path = compute_scene_spatial_layout_path(project_dir, scene_id)
    if not spatial_layout_path:
        raise FileNotFoundError("缺少 spatial_layout.png。请先在场景工作台生成位置图。")

    if not block_world_builder.node_available():
        raise block_world_builder.BlockWorldUnavailable()

    report(0.20, "准备 spatial_layout voxel 参考图...")
    model_refs_dir = stage_manifest.stage_dir(project_dir, scene_id) / "voxel_model_refs"
    if model_refs_dir.exists():
        shutil.rmtree(model_refs_dir)

    scene_world_path = world_path(project_dir, scene_id)
    scene_world_path.parent.mkdir(parents=True, exist_ok=True)

    base_description = description.strip() or "\n".join(
        [
            f"场景名称：{scene_id}",
            "请只根据 spatial_layout.png 生成可编辑的 voxel DirectorWorld。",
            "只放固定场景物件，不放人物、动作或剧情道具。",
        ]
    )
    full_description = _with_pano_voxel_ref_instructions(base_description)
    model_spatial_layout_path = _compress_model_reference(
        Path(spatial_layout_path),
        model_refs_dir,
        max_side=1152,
        jpeg_quality=76,
    )

    cmd = [
        sys.executable,
        "-m",
        "ai_anime.modules.asset_world.infrastructure.director_world.block_world_builder",
        "--description",
        full_description,
        "--output",
        str(scene_world_path),
        "--scene-id",
        safe_name(scene_id),
        "--display-name",
        scene_id,
        "--max-blocks",
        str(int(max_blocks)),
        "--max-abs-coord",
        str(int(max_abs_coord)),
        "--max-y",
        str(int(max_y)),
        "--image",
        str(model_spatial_layout_path),
    ]

    archived: Path | None = None
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    if scene_world_path.exists():
        archived = scene_world_path.with_name(f"world_{timestamp}.json")
        scene_world_path.replace(archived)

    report(0.55, "正在生成 voxel world.json...")
    logger.info("running voxel world generator: %s", " ".join(cmd[:2] + ["..."]))
    proc = run_project_model_subprocess(
        cmd,
        capture_output=True,
        text=True,
        timeout=int(timeout_seconds),
    )

    if proc.returncode != 0:
        failed_path: Path | None = None
        if scene_world_path.exists():
            failed_path = scene_world_path.with_name(f"world_failed_{timestamp}.json")
            scene_world_path.replace(failed_path)
        if archived is not None and archived.exists() and not scene_world_path.exists():
            archived.replace(scene_world_path)
        message = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            "DirectorWorld 生成失败: "
            f"{message[-1000:]}" + (f"；失败输出已保留: {failed_path}" if failed_path else "")
        )

    if not scene_world_path.exists():
        if archived is not None and archived.exists():
            archived.replace(scene_world_path)
        raise RuntimeError(
            "DirectorWorld 生成器成功退出，但没有写出 world.json: " f"{scene_world_path}"
        )

    report(0.90, "voxel world.json 已写出")
    return {
        "ok": True,
        "scene_id": scene_id,
        "world_path": str(scene_world_path),
        "pano_path": "",
        "spatial_layout_path": str(spatial_layout_path),
        "refs_dir": "",
        "ref_paths": [],
        "model_refs_dir": str(model_refs_dir),
        "model_ref_paths": [str(model_spatial_layout_path)],
        "archived_path": str(archived) if archived else None,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "stdout_tail": (proc.stdout or "")[-2000:],
    }
__all__ = ["run_voxel_world_from_360"]
