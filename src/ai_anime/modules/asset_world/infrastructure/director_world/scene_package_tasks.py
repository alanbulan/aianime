"""Scene package import, compression, and collision subprocess adapters."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ai_anime.modules.asset_world.infrastructure.director_world import stage_manifest
from ai_anime.modules.task_execution.public import run_project_subprocess

logger = logging.getLogger(__name__)


def splat_transform_executable() -> Path:
    """Locate the splat-transform CLI (PLY→SOG compression).

    Resolution: ``AI_ANIME_SPLAT_TRANSFORM_BIN`` env override → on PATH. Install with
    ``npm install -g @playcanvas/splat-transform`` (the CE Docker image does this
    when built with ``INSTALL_WORLD=1``). Metadata in pyproject.toml
    ``[tool.ai_anime.external-tools.splat-transform]``.
    """
    override = os.environ.get("AI_ANIME_SPLAT_TRANSFORM_BIN", "").strip()
    if override:
        candidate = Path(override)
        if candidate.exists():
            return candidate
    on_path = shutil.which("splat-transform")
    if on_path:
        return Path(on_path)
    raise FileNotFoundError(
        "splat-transform 未安装。桌面版请到“设置 → 环境依赖”检查并安装导演世界 "
        "3D 运行环境；开发环境可设置 AI_ANIME_SPLAT_TRANSFORM_BIN。"
    )


def _splat_transform_command() -> tuple[list[str], dict[str, str] | None]:
    """Resolve the CLI invocation, including the packaged Node.js runtime."""
    cli = splat_transform_executable()
    if cli.suffix.lower() not in {".js", ".mjs", ".cjs"}:
        return [str(cli)], None

    configured_node = os.environ.get("AI_ANIME_SPLAT_TRANSFORM_NODE", "").strip()
    node = configured_node or shutil.which("node")
    if not node:
        raise FileNotFoundError(
            "splat-transform is packaged as JavaScript, but no Node runtime is available."
        )
    return [str(node), str(cli)], dict(os.environ)


SCENE_PACKAGE_SUFFIXES = {".ply", ".sog", ".splat", ".ksplat"}


def _keep_raw_3gs_ply() -> bool:
    return str(os.environ.get("KEEP_RAW_3GS_PLY") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _sog_path_for_ply(path: Path) -> Path:
    return Path(path).with_suffix(".sog")


def _compress_ply_to_sog(
    ply_path: Path,
    sog_path: Path | None = None,
    *,
    timeout_seconds: int = 1800,
    progress_callback: Callable[[float, str], None] | None = None,
) -> Path:
    """Compress a generated PLY into PlayCanvas SOG format.

    SHARP emits PLY. Browser-facing assets should use SOG because raw PLY files
    are too large to load repeatedly in Freezone / ai-anime-fe.
    """
    src = Path(ply_path)
    if src.suffix.lower() != ".ply":
        return src
    if not src.exists():
        raise FileNotFoundError(f"PLY not found for SOG compression: {src}")
    dest = Path(sog_path) if sog_path is not None else _sog_path_for_ply(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    command_prefix, child_env = _splat_transform_command()
    cmd = [*command_prefix, "-w"]
    iterations = str(os.environ.get("SOG_COMPRESSION_ITERATIONS") or "").strip()
    if iterations:
        cmd.extend(["-i", iterations])
    gpu = str(os.environ.get("SOG_COMPRESSION_GPU") or "").strip()
    if gpu:
        cmd.extend(["-g", gpu])
    cmd.extend([str(src), str(dest)])
    if progress_callback:
        progress_callback(0.88, "压缩 3GS PLY → SOG...")
    logger.info("running splat-transform SOG compression: %s", " ".join(cmd))
    proc = run_project_subprocess(
        cmd,
        cwd=dest.parent,
        capture_output=True,
        text=True,
        timeout=int(timeout_seconds),
        env=child_env,
    )
    if proc.returncode != 0 or not dest.exists():
        message = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"PLY → SOG 压缩失败: {message[-2000:]}")
    return dest


def _archive_existing(path: Path, timestamp: str) -> Path | None:
    if not path.exists():
        return None
    archived = path.with_name(f"{path.stem}_{timestamp}{path.suffix}")
    path.replace(archived)
    return archived


def _cleanup_raw_ply(*paths: Path | None) -> None:
    if _keep_raw_3gs_ply():
        return
    for path in paths:
        if path is None:
            continue
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            logger.warning("failed to remove raw 3GS PLY: %s", path)


def upload_scene_package(
    project_dir: Path,
    scene_id: str,
    src_asset: Path,
    *,
    target_name: str | None = None,
) -> dict[str, Any]:
    """Copy a user-provided custom 3GS scene package into the v1 stage directory."""
    src = Path(src_asset)
    if not src.exists():
        raise FileNotFoundError(f"3GS scene package not found: {src}")
    suffix = src.suffix.lower()
    if suffix not in SCENE_PACKAGE_SUFFIXES:
        raise ValueError("Custom scene package must be .ply, .sog, .splat, or .ksplat")
    out_dir = stage_manifest.stage_dir(project_dir, scene_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    if target_name is None:
        target_name = f"custom{suffix}"
    dest = out_dir / target_name
    if suffix == ".ply":
        raw_dest = out_dir / Path(target_name).with_suffix(".ply").name
        shutil.copy2(src, raw_dest)
        dest = out_dir / Path(target_name).with_suffix(".sog").name
        _compress_ply_to_sog(raw_dest, dest)
        _cleanup_raw_ply(raw_dest)
    else:
        shutil.copy2(src, dest)

    stage_manifest.update_manifest(
        project_dir,
        scene_id,
        clear_fields=[
            "collision_glb_path",
            "voxel_json_path",
            "pano_sharp_args",
            "single_face_sharp_args",
            "splat_transform_args",
        ],
        ply_path=dest.name,
        custom_scene_path=dest.name,
        source="custom_scene",
    )
    return {"ok": True, "scene_path": str(dest)}


def run_splat_collision(
    project_dir: Path,
    scene_id: str,
    ply_path: Path | None = None,
    progress_callback: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """Run `splat-transform -K <ply> <out>.voxel.json` to produce a collision GLB.

    The CLI's `-K` flag emits a `.voxel.json` AND a sibling `.collision.glb`.
    We glob the output dir for `*.collision.glb` afterwards because the exact
    filename is determined by the CLI, not us.
    """
    out_dir = stage_manifest.stage_dir(project_dir, scene_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    if ply_path is None:
        resolved = stage_manifest.resolve_ply_path(project_dir, scene_id)
        if resolved is None:
            raise FileNotFoundError(
                f"No PLY found in manifest for scene {scene_id!r}. Upload one first."
            )
        ply_path = resolved
    ply_path = Path(ply_path)
    if not ply_path.exists():
        raise FileNotFoundError(f"PLY not found: {ply_path}")

    voxel_out = out_dir / "scene.voxel.json"
    command_prefix, child_env = _splat_transform_command()

    seed_pos = os.environ.get("STAGE_COLLISION_SEED_POS", "0,0,0").strip() or "0,0,0"
    profiles = [
        {
            "name": "standard",
            "label": "降级",
            "voxel_params": os.environ.get("STAGE_COLLISION_VOXEL_PARAMS", "0.16,0.38"),
            "voxel_carve": os.environ.get("STAGE_COLLISION_VOXEL_CARVE", "1.8,0.35"),
        },
        {
            "name": "coarse",
            "label": "粗略",
            "voxel_params": "0.24,0.5",
            "voxel_carve": "2.2,0.5",
        },
        {
            "name": "very_coarse",
            "label": "超粗略",
            "voxel_params": "0.32,0.62",
            "voxel_carve": "2.6,0.65",
        },
    ]

    archived_glbs: list[tuple[Path, Path]] = []
    archived_voxel: tuple[Path, Path] | None = None
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

    def report(progress: float, message: str) -> None:
        if progress_callback:
            progress_callback(progress, message)

    def restore_archived_outputs() -> None:
        for original, archived in archived_glbs:
            if archived.exists() and not original.exists():
                try:
                    archived.replace(original)
                except OSError:
                    logger.warning("failed to restore archived collision GLB: %s", archived)
        if archived_voxel is not None:
            original, archived = archived_voxel
            if archived.exists() and not original.exists():
                try:
                    archived.replace(original)
                except OSError:
                    logger.warning("failed to restore archived voxel JSON: %s", archived)

    def remove_fresh_outputs() -> None:
        if voxel_out.exists():
            try:
                voxel_out.unlink()
            except OSError:
                logger.warning("failed to remove partial voxel JSON: %s", voxel_out)
        for fresh in out_dir.glob("*.collision.glb"):
            try:
                fresh.unlink()
            except OSError:
                logger.warning("failed to remove partial collision GLB: %s", fresh)

    def is_scale_failure(proc: subprocess.CompletedProcess[str]) -> bool:
        text = f"{proc.stdout or ''}\n{proc.stderr or ''}"
        return any(
            marker in text
            for marker in (
                "Map maximum size exceeded",
                "JavaScript heap out of memory",
                "Allocation failed",
                "Array buffer allocation failed",
            )
        )

    # Move stale collision GLBs aside so glob below picks only fresh output.
    # If splat-transform fails, restore the last known-good files.
    for stale in out_dir.glob("*.collision.glb"):
        try:
            archived = stale.with_name(f"{stale.name}.{timestamp}.bak")
            stale.replace(archived)
            archived_glbs.append((stale, archived))
        except OSError:
            pass

    if voxel_out.exists():
        try:
            archived = voxel_out.with_name(f"{voxel_out.name}.{timestamp}.bak")
            voxel_out.replace(archived)
            archived_voxel = (voxel_out, archived)
        except OSError:
            pass

    failures: list[str] = []
    proc: subprocess.CompletedProcess[str] | None = None
    selected_profile: dict[str, str] | None = None
    for idx, profile in enumerate(profiles):
        remove_fresh_outputs()
        cmd = [
            *command_prefix,
            "-w",
            "-K",
            "--seed-pos",
            seed_pos,
            "--voxel-params",
            str(profile["voxel_params"]),
            "--voxel-carve",
            str(profile["voxel_carve"]),
            str(ply_path),
            str(voxel_out),
        ]
        report(0.40 + idx * 0.10, f"生成调度区域（{profile['label']}精度）...")
        logger.info("running splat-transform: %s", " ".join(cmd))
        proc = run_project_subprocess(
            cmd,
            cwd=out_dir,
            capture_output=True,
            text=True,
            timeout=600,
            env=child_env,
        )
        if proc.returncode == 0:
            selected_profile = profile
            break

        failures.append(
            f"profile={profile['name']} exit={proc.returncode} "
            f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
        )
        if not is_scale_failure(proc) or idx == len(profiles) - 1:
            restore_archived_outputs()
            raise RuntimeError("splat-transform failed: " + "\n".join(failures))
        report(0.45 + idx * 0.10, "调度区域过细，自动降低精度重试...")

    if proc is None or selected_profile is None:
        restore_archived_outputs()
        raise RuntimeError("splat-transform failed before starting")

    glbs = list(out_dir.glob("*.collision.glb"))
    if not glbs:
        restore_archived_outputs()
        raise RuntimeError(
            "splat-transform completed but no *.collision.glb produced in "
            f"{out_dir}. stdout={proc.stdout!r} stderr={proc.stderr!r}"
        )
    collision_glb = sorted(glbs, key=lambda p: p.stat().st_mtime, reverse=True)[0]

    voxel_name = voxel_out.name if voxel_out.exists() else None
    stage_manifest.update_manifest(
        project_dir,
        scene_id,
        collision_glb_path=collision_glb.name,
        voxel_json_path=voxel_name,
        splat_transform_args={
            "flag": "-K",
            "overwrite": True,
            "profile": selected_profile["name"],
            "seed_pos": seed_pos,
            "voxel_params": selected_profile["voxel_params"],
            "voxel_carve": selected_profile["voxel_carve"],
        },
    )

    for _, archived in archived_glbs:
        try:
            archived.unlink()
        except OSError:
            pass
    if archived_voxel is not None:
        try:
            archived_voxel[1].unlink()
        except OSError:
            pass

    return {
        "ok": True,
        "collision_glb_path": str(collision_glb),
        "voxel_json_path": str(voxel_out) if voxel_out.exists() else None,
        "profile": selected_profile["name"],
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "stdout_tail": (proc.stdout or "")[-2000:],
        "retry_failures": failures,
    }



__all__ = [
    "run_splat_collision",
    "splat_transform_executable",
    "upload_scene_package",
]
