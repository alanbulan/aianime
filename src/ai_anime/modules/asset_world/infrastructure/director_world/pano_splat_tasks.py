"""Pano and single-image SHARP subprocess adapters."""

from __future__ import annotations

import logging
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

from ai_anime.modules.asset_world.infrastructure.director_world import (
    pano_sharp,
    stage_manifest,
)
from ai_anime.modules.asset_world.infrastructure.director_world.scene_package_tasks import (
    _archive_existing,
    _cleanup_raw_ply,
    _compress_ply_to_sog,
    _keep_raw_3gs_ply,
    _sog_path_for_ply,
)
from ai_anime.modules.task_execution.public import run_project_subprocess
from ai_anime.shared.utils.path_resolver import (
    compute_scene_master_path,
    compute_scene_reverse_master_path,
)

logger = logging.getLogger(__name__)

_PANO_SHARP_MODULE = "ai_anime.modules.asset_world.infrastructure.director_world.pano_sharp"


def _sharp_checkpoint_path() -> Path:
    """Return the cache path used by torch.hub.load_state_dict_from_url()."""
    torch_home = str(os.environ.get("TORCH_HOME") or "").strip()
    if torch_home:
        cache_root = Path(torch_home)
    else:
        xdg_cache = str(os.environ.get("XDG_CACHE_HOME") or "").strip()
        cache_root = (Path(xdg_cache) if xdg_cache else Path.home() / ".cache") / "torch"
    checkpoint_name = Path(urlsplit(pano_sharp.DEFAULT_MODEL_URL).path).name
    return cache_root / "hub" / "checkpoints" / checkpoint_name


def _sharp_start_message(source_kind: str, device: str) -> str:
    device_label = {
        "auto": "GPU 优先，GPU 不可用时使用 CPU",
        "cuda": "NVIDIA CUDA GPU",
        "mps": "Apple GPU",
        "cpu": "CPU",
    }.get(device, device)
    checkpoint = _sharp_checkpoint_path()
    if checkpoint.is_file():
        model_status = "加载已缓存的 SHARP 模型"
    else:
        model_status = "首次下载 SHARP 模型（约 2.81 GB，完成后会缓存）"
    return f"{model_status}；{source_kind} → 单面 3GS；计算设备：{device_label}..."


def _sharp_device_from_output(output: str) -> str:
    marker = "device="
    for line in reversed(str(output or "").splitlines()):
        if marker not in line:
            continue
        value = line.split(marker, 1)[1].split(",", 1)[0].strip()
        if value:
            return value
    return ""


def _pano_sharp_command() -> list[str]:
    """Return a worker command that also works inside the frozen desktop backend."""
    configured_runtime = os.environ.get("AI_ANIME_WORLD_RUNTIME_BIN", "").strip()
    if configured_runtime:
        runtime_path = Path(configured_runtime)
        if not runtime_path.is_file():
            raise FileNotFoundError(
                "导演世界 3D 运行环境尚未安装或不完整，请到“设置 → 环境依赖”检查并安装。"
            )
        return [str(runtime_path)]
    if bool(getattr(sys, "frozen", False)):
        raise RuntimeError(
            "导演世界 3D 运行环境尚未安装或不完整，请到“设置 → 环境依赖”检查并安装。"
        )
    return [sys.executable, "-m", _PANO_SHARP_MODULE]


def _world_runtime_available() -> bool:
    configured_runtime = os.environ.get("AI_ANIME_WORLD_RUNTIME_BIN", "").strip()
    return bool(configured_runtime and Path(configured_runtime).is_file())


def run_pano_sharp(
    project_dir: Path,
    scene_id: str,
    pano_path: Path | None = None,
    *,
    artifact_dir: Path | None = None,
    update_manifest: bool = True,
    depth_source: str = "da2",
    depth_device: str = "auto",
    device: str = "auto",
    geometry_mode: str = "pano-depth",
    pano_depth_width: int = 2048,
    pano_depth_point_scale: float = 0.72,
    pano_depth_min_scale: float = 0.0008,
    pano_depth_max_scale: float = 0.045,
    pano_depth_opacity: float = 0.96,
    pano_depth_radius_scale: float = 1.0,
    face_size: int = 768,
    internal_size: int = 1536,
    max_gaussians_per_face: int = 1_000_000,
    timeout_seconds: int = 1800,
    progress_callback: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """Run the package SHARP module to build a 360-derived PLY."""

    def report(progress: float, message: str) -> None:
        if progress_callback:
            progress_callback(progress, message)

    project_dir = Path(project_dir)
    out_dir = (
        Path(artifact_dir)
        if artifact_dir is not None
        else stage_manifest.stage_dir(project_dir, scene_id)
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    if pano_path is None:
        resolved = stage_manifest.resolve_pano_path(project_dir, scene_id)
        if resolved is None:
            raise FileNotFoundError("缺少 pano_360.png。请先上传或生成 360 全景。")
        pano_path = resolved
    pano_path = Path(pano_path)
    if not pano_path.exists():
        raise FileNotFoundError(f"pano_360.png not found: {pano_path}")

    if not (_world_runtime_available() or pano_sharp.sharp_available()):
        raise pano_sharp.Sharp3DUnavailable()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    run_dir = out_dir / "pano_sharp_runs" / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)
    geometry_mode = str(geometry_mode or "pano-depth").strip().lower().replace("_", "-")
    if geometry_mode in {"pano-depth-debug", "depth-debug", "depth"}:
        geometry_mode = "pano-depth"
    if geometry_mode not in {"pano-depth", "sharp"}:
        raise ValueError(f"unknown pano geometry_mode: {geometry_mode}")
    output_name = "pano_depth.ply" if geometry_mode == "pano-depth" else "pano_sharp_merged.ply"
    generated_ply = run_dir / output_name
    dest_ply = out_dir / output_name
    dest_sog = _sog_path_for_ply(dest_ply)

    depth_source = str(depth_source or "da2").strip().lower()
    if depth_source == "da2" and not (
        _world_runtime_available() or pano_sharp.da2_available()
    ):
        logger.warning("DA-2 package is not installed; falling back to constant depth.")
        report(0.18, "DA-2 未安装，降级使用 constant depth；几何质量会降低。")
        depth_source = "constant"
    depth_device = (
        str(depth_device or os.environ.get("PANO_SHARP_DEPTH_DEVICE") or "auto").strip().lower()
    )
    device = str(device or os.environ.get("PANO_SHARP_DEVICE") or "auto").strip().lower()
    face_size = int(face_size)
    internal_size = int(internal_size)
    max_gaussians_per_face = int(max_gaussians_per_face)
    # Viewer pano_correction is a display-only initial-view adjustment. The
    # pano->PLY path must cut the raw 2:1 panorama using the production topology
    # contract; otherwise a saved viewer yaw can rotate every cubemap face.
    front_yaw_deg = 0.0
    sphere_yaw_deg = 0.0
    sphere_pitch_deg = 0.0
    sphere_roll_deg = 0.0

    def _fallback_unavailable_mps(name: str) -> str:
        if name != "mps":
            return name
        try:
            import torch  # type: ignore

            if torch.backends.mps.is_available():
                return name
        except Exception:
            pass
        return "auto"

    device = _fallback_unavailable_mps(device)
    depth_device = _fallback_unavailable_mps(depth_device)

    cmd = [
        *_pano_sharp_command(),
        "--pano",
        str(pano_path),
        "--output-dir",
        str(run_dir),
        "--depth-source",
        depth_source,
        "--depth-device",
        depth_device,
        "--geometry-mode",
        geometry_mode,
        "--device",
        device,
    ]
    if geometry_mode == "pano-depth":
        cmd.extend(
            [
                "--pano-depth-width",
                str(int(pano_depth_width)),
                "--pano-depth-radius-scale",
                str(float(pano_depth_radius_scale)),
                "--pano-depth-point-scale",
                str(float(pano_depth_point_scale)),
                "--pano-depth-min-scale",
                str(float(pano_depth_min_scale)),
                "--pano-depth-max-scale",
                str(float(pano_depth_max_scale)),
                "--pano-depth-opacity",
                str(float(pano_depth_opacity)),
                "--pano-depth-output-name",
                output_name,
            ]
        )
    else:
        cmd.extend(
            [
                "--face-size",
                str(face_size),
                "--internal-size",
                str(internal_size),
            ]
        )
        if max_gaussians_per_face > 0:
            cmd.extend(["--max-gaussians-per-face", str(max_gaussians_per_face)])

    report(
        0.20,
        (
            "启动 360 → depth 3GS..."
            if geometry_mode == "pano-depth"
            else "启动 pano_sharp：360 → cubemap → SHARP → 3GS..."
        ),
    )
    logger.info("running pano ply builder: %s", " ".join(cmd[:2] + ["..."]))
    proc = run_project_subprocess(
        cmd,
        capture_output=True,
        text=True,
        timeout=int(timeout_seconds),
    )
    if proc.returncode != 0:
        message = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"pano_sharp 失败: {message[-2000:]}")

    if not generated_ply.exists():
        message = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            "360 PLY 生成器成功退出，但没有写出目标 PLY: " f"{generated_ply}. {message[-1000:]}"
        )

    archived_sog = _archive_existing(dest_sog, timestamp)
    archived_ply: Path | None = None
    try:
        _compress_ply_to_sog(
            generated_ply,
            dest_sog,
            timeout_seconds=max(300, min(int(timeout_seconds), 1800)),
            progress_callback=progress_callback,
        )
    except Exception:
        dest_sog.unlink(missing_ok=True)
        if archived_sog is not None and archived_sog.exists():
            archived_sog.replace(dest_sog)
        raise

    if _keep_raw_3gs_ply():
        archived_ply = _archive_existing(dest_ply, timestamp)
        shutil.copy2(generated_ply, dest_ply)
    else:
        _cleanup_raw_ply(generated_ply, dest_ply)
    if archived_sog is not None:
        archived_sog.unlink(missing_ok=True)
        archived_sog = None

    report(0.90, f"{dest_sog.name} 已写入 3GS 资产包")
    if update_manifest:
        existing_source = (stage_manifest.load_manifest(project_dir, scene_id) or {}).get("source")
        manifest_source = (
            existing_source
            if existing_source in {"uploaded_360", "uploaded_master", "text_to_360"}
            else "uploaded_360"
        )
        stage_manifest.update_manifest(
            project_dir,
            scene_id,
            clear_fields=[
                "collision_glb_path",
                "voxel_json_path",
                "splat_transform_args",
            ],
            ply_path=dest_sog.name,
            pano_ply_path=dest_sog.name,
            pano_depth_ply_path=(dest_sog.name if geometry_mode == "pano-depth" else None),
            source=manifest_source,
            pano_sharp_args={
                "script": "ai_anime.modules.asset_world.infrastructure.director_world.pano_sharp",
                "geometry_mode": geometry_mode,
                "depth_source": depth_source,
                "depth_device": depth_device,
                "device": device,
                "face_size": face_size,
                "internal_size": internal_size,
                "max_gaussians_per_face": max_gaussians_per_face,
                "pano_depth_width": int(pano_depth_width),
                "pano_depth_radius_scale": float(pano_depth_radius_scale),
                "pano_depth_point_scale": float(pano_depth_point_scale),
                "pano_depth_min_scale": float(pano_depth_min_scale),
                "pano_depth_max_scale": float(pano_depth_max_scale),
                "pano_depth_opacity": float(pano_depth_opacity),
                "global_depth_align": geometry_mode == "sharp",
                "global_depth_warp_strength": 1.0 if geometry_mode == "sharp" else None,
                "front_yaw_deg": front_yaw_deg,
                "sphere_correction_deg": {
                    "yaw": sphere_yaw_deg,
                    "pitch": sphere_pitch_deg,
                    "roll": sphere_roll_deg,
                },
                "run_dir": str(run_dir),
            },
        )

    return {
        "ok": True,
        "scene_id": scene_id,
        "pano_path": str(pano_path),
        "ply_path": str(dest_sog),
        "sog_path": str(dest_sog),
        "raw_ply_path": str(dest_ply) if dest_ply.exists() else None,
        "run_dir": str(run_dir),
        "archived_ply": str(archived_ply) if archived_ply else None,
        "archived_sog": str(archived_sog) if archived_sog else None,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "stdout_tail": (proc.stdout or "")[-2000:],
        "stderr_tail": (proc.stderr or "")[-2000:],
    }


def run_single_face_sharp(
    project_dir: Path,
    scene_id: str,
    image_path: Path | None = None,
    *,
    artifact_dir: Path | None = None,
    update_manifest: bool = True,
    source_kind: str = "master",
    face_name: str = "front",
    depth_meters: float = 8.0,
    device: str = "auto",
    face_size: int = 768,
    internal_size: int = 1536,
    max_gaussians_per_face: int = 1_000_000,
    timeout_seconds: int = 1800,
    progress_callback: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """Run SHARP directly on one perspective image and save it as a source-specific PLY."""

    def report(progress: float, message: str) -> None:
        if progress_callback:
            progress_callback(progress, message)

    project_dir = Path(project_dir)
    out_dir = (
        Path(artifact_dir)
        if artifact_dir is not None
        else stage_manifest.stage_dir(project_dir, scene_id)
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    source_kind = str(source_kind or "master").strip().lower()
    if source_kind not in {"master", "reverse"}:
        raise ValueError(f"unknown single-face source_kind: {source_kind}")

    if image_path is None:
        if source_kind == "reverse":
            reverse_path = compute_scene_reverse_master_path(project_dir, scene_id)
            if not reverse_path:
                raise FileNotFoundError("缺少 reverse_master.png。请先生成 reverse master。")
            image_path = Path(reverse_path)
        else:
            master_path = compute_scene_master_path(project_dir, scene_id)
            if not master_path:
                raise FileNotFoundError("缺少 master.png。请先上传或生成场景源图。")
            image_path = Path(master_path)
    image_path = Path(image_path)
    if not image_path.exists():
        raise FileNotFoundError(f"single-face source image not found: {image_path}")

    if not (_world_runtime_available() or pano_sharp.sharp_available()):
        raise pano_sharp.Sharp3DUnavailable()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    run_dir = out_dir / "single_face_sharp_runs" / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)
    generated_ply = run_dir / "pano_sharp_merged.ply"
    dest_ply = out_dir / ("reverse_sharp.ply" if source_kind == "reverse" else "master_sharp.ply")
    dest_sog = _sog_path_for_ply(dest_ply)

    device = str(device or os.environ.get("PANO_SHARP_DEVICE") or "auto").strip().lower()
    if device == "mps":
        try:
            import torch  # type: ignore

            if not torch.backends.mps.is_available():
                device = "auto"
        except Exception:
            device = "auto"

    cmd = [
        *_pano_sharp_command(),
        "--image",
        str(image_path),
        "--output-dir",
        str(run_dir),
        "--single-face-name",
        str(face_name or "front"),
        "--depth-source",
        "constant",
        "--depth-meters",
        str(float(depth_meters)),
        "--device",
        device,
        "--face-size",
        str(int(face_size)),
        "--internal-size",
        str(int(internal_size)),
    ]
    if int(max_gaussians_per_face) > 0:
        cmd.extend(["--max-gaussians-per-face", str(int(max_gaussians_per_face))])

    report(0.20, _sharp_start_message(source_kind, device))
    logger.info("running single-face sharp: %s", " ".join(cmd[:2] + ["..."]))
    proc = run_project_subprocess(
        cmd,
        capture_output=True,
        text=True,
        timeout=int(timeout_seconds),
    )
    if proc.returncode != 0:
        message = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"single-face SHARP 失败: {message[-2000:]}")

    actual_device = _sharp_device_from_output(proc.stdout or "")
    report(
        0.84,
        f"SHARP 推理完成（计算设备：{actual_device or device}），正在整理 3GS 点云...",
    )

    if not generated_ply.exists():
        message = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            "single-face SHARP 成功退出，但没有写出 pano_sharp_merged.ply: "
            f"{generated_ply}. {message[-1000:]}"
        )

    archived_sog = _archive_existing(dest_sog, timestamp)
    archived_ply: Path | None = None
    try:
        _compress_ply_to_sog(
            generated_ply,
            dest_sog,
            timeout_seconds=max(300, min(int(timeout_seconds), 1800)),
            progress_callback=progress_callback,
        )
    except Exception:
        dest_sog.unlink(missing_ok=True)
        if archived_sog is not None and archived_sog.exists():
            archived_sog.replace(dest_sog)
        raise

    if _keep_raw_3gs_ply():
        archived_ply = _archive_existing(dest_ply, timestamp)
        shutil.copy2(generated_ply, dest_ply)
    else:
        _cleanup_raw_ply(generated_ply, dest_ply)
    if archived_sog is not None:
        archived_sog.unlink(missing_ok=True)
        archived_sog = None

    report(0.90, f"{source_kind} single-face SOG 已写入 3GS 资产包")
    path_field = "reverse_ply_path" if source_kind == "reverse" else "master_ply_path"
    args_field = "reverse_sharp_args" if source_kind == "reverse" else "master_sharp_args"
    manifest_source = "single_face_reverse" if source_kind == "reverse" else "single_face_master"
    args_payload = {
        "script": "ai_anime.modules.asset_world.infrastructure.director_world.pano_sharp",
        "source_kind": source_kind,
        "image_path": str(image_path),
        "face_name": str(face_name or "front"),
        "depth_meters": float(depth_meters),
        "device": device,
        "face_size": int(face_size),
        "internal_size": int(internal_size),
        "max_gaussians_per_face": int(max_gaussians_per_face),
        "run_dir": str(run_dir),
    }
    if update_manifest:
        stage_manifest.update_manifest(
            project_dir,
            scene_id,
            clear_fields=[
                "collision_glb_path",
                "voxel_json_path",
                "splat_transform_args",
            ],
            ply_path=dest_sog.name,
            source=manifest_source,
            single_face_sharp_args=args_payload,
            **{path_field: dest_sog.name, args_field: args_payload},
        )

    return {
        "ok": True,
        "scene_id": scene_id,
        "image_path": str(image_path),
        "ply_path": str(dest_sog),
        "sog_path": str(dest_sog),
        "raw_ply_path": str(dest_ply) if dest_ply.exists() else None,
        "run_dir": str(run_dir),
        "archived_ply": str(archived_ply) if archived_ply else None,
        "archived_sog": str(archived_sog) if archived_sog else None,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "stdout_tail": (proc.stdout or "")[-2000:],
        "stderr_tail": (proc.stderr or "")[-2000:],
    }



__all__ = ["run_pano_sharp", "run_single_face_sharp"]
