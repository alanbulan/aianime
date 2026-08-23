"""Scene 360 generation, trace capture, and model-usage accounting."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import os
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ai_anime.modules.model_usage.public import model_access_configured
from ai_anime.modules.asset_world.infrastructure.director_world import stage_manifest
from ai_anime.modules.model_usage.public import get_usage_meter
from ai_anime.modules.task_execution.public import (
    TaskCancelled,
    TaskTimedOut,
    run_project_model_subprocess,
)
from ai_anime.modules.model_usage.public import DEFAULT_SCENE_SPATIAL_CONTRACT_MODEL
from ai_anime.shared.utils.path_resolver import (
    compute_scene_master_path,
    compute_scene_reverse_master_path,
)
from ai_anime.modules.asset_world.infrastructure.director_world.worker_runtime import (
    SCENE_360_BUILDER_MODULE,
    SCENE_OVERLAP_ANALYZER_MODULE,
    SCENE_SPATIAL_CONTRACT_MODULE,
    worker_command,
)

logger = logging.getLogger(__name__)


SPATIAL_CONTRACT_SCHEMA_VERSION = "scene_spatial_contract_v8_topology_only_locks"
SPATIAL_CONTRACT_DEFAULT_MODEL = DEFAULT_SCENE_SPATIAL_CONTRACT_MODEL
SAFE_SEAM_SPHERE_YAW_DEG = -90.0


def _run_credit_coro(coro_factory):
    """Run async credit helpers from this synchronous subprocess wrapper."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro_factory())

    ctx = contextvars.copy_context()
    result: dict[str, Any] = {}

    def runner() -> None:
        try:
            result["value"] = ctx.run(lambda: asyncio.run(coro_factory()))
        except BaseException as exc:  # noqa: BLE001
            result["error"] = exc

    thread = threading.Thread(target=runner, name="stage-asset-credit", daemon=True)
    thread.start()
    thread.join()
    if "error" in result:
        raise result["error"]
    return result.get("value")


def _clean_trace_value(value: Any) -> str:
    return str(value or "").strip()


def _read_scene_360_provider_trace(generation_dir: Path) -> dict[str, str]:
    manifest_path = Path(generation_dir) / "scene_360_manifest.json"
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        logger.debug("scene_360 trace manifest unavailable: %s", exc)
        return {}
    if not isinstance(payload, dict):
        return {}
    request_id = _clean_trace_value(
        payload.get("request_id")
        or payload.get("provider_request_id")
        or payload.get("newapi_request_id")
    )
    provider_task_id = _clean_trace_value(
        payload.get("provider_task_id") or payload.get("task_id")
    )
    response_id = _clean_trace_value(
        payload.get("response_id") or payload.get("provider_response_id")
    )
    trace: dict[str, str] = {}
    if request_id:
        trace["request_id"] = request_id
    if provider_task_id:
        trace["provider_task_id"] = provider_task_id
    if response_id:
        trace["response_id"] = response_id
    return trace


def _scene_360_credit_billing_params(
    *,
    image_size: str,
    quality: str,
) -> dict[str, str]:
    params: dict[str, str] = {}
    clean_size = str(image_size or "").strip().lower()
    if clean_size:
        params["size"] = clean_size
    clean_quality = str(quality or "").strip().lower()
    if clean_quality:
        params["quality"] = clean_quality
    return params


def _reserve_scene_360_model_call(
    model: str,
    *,
    provider: str,
    image_size: str,
    quality: str,
) -> str:
    model_name = str(model or "").strip()
    if not model_name:
        return ""

    async def _reserve() -> str:
        return await get_usage_meter().reserve_current_model_call_credit(
            model=model_name,
            resource_kind="render",
            billing_kind="image",
            billing_params=_scene_360_credit_billing_params(
                image_size=image_size,
                quality=quality,
            ),
            metadata={"source": "scene_360_subprocess", "provider": provider},
        )

    return str(_run_credit_coro(_reserve) or "")


def _refund_scene_360_model_call(
    reservation_id: str,
    *,
    provider: str,
    error: str,
) -> None:
    if not reservation_id:
        return

    async def _refund() -> None:
        await get_usage_meter().refund_model_call_credit_reservation(
            reservation_id,
            metadata={
                "source": "scene_360_subprocess",
                "provider": provider,
                "error": error[:200],
            },
        )

    try:
        _run_credit_coro(_refund)
    except Exception as exc:  # noqa: BLE001
        logger.debug("scene_360 credit refund failed: %s", exc)


def _confirm_scene_360_model_call(
    *,
    model: str,
    reservation_id: str,
    provider: str,
    provider_request_id: str = "",
    provider_task_id: str = "",
    provider_response_id: str = "",
) -> None:
    if not reservation_id:
        return

    async def _confirm() -> None:
        await get_usage_meter().bump_model_call(
            user_id=None,
            model=model,
            resource_kind="render",
            provider_request_id=provider_request_id,
            provider_task_id=provider_task_id,
            credit_reservation_id=reservation_id,
            metadata={
                "source": "scene_360_subprocess",
                "provider": provider,
                **({"response_id": provider_response_id} if provider_response_id else {}),
            },
        )

    try:
        _run_credit_coro(_confirm)
    except Exception as exc:  # noqa: BLE001
        logger.debug("scene_360 credit confirm failed: %s", exc)


def resolve_scene_360_image_model(model: str = "") -> str:
    """Return the model used by scene 360 image generation."""
    resolved_model = str(model or "").strip()
    if not resolved_model:
        raise ValueError("scene 360 image model is required")
    return resolved_model


def _json_file_has_schema(path: Path, schema_version: str) -> bool:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return data.get("schema_version") == schema_version


def run_scene_360(
    project_dir: Path,
    scene_id: str,
    *,
    source: str,
    description: str = "",
    model: str = "",
    model_selector: str = "",
    style: str = "",
    image_size: str = "",
    quality: str = "",
    master_path_override: str | Path | None = None,
    reverse_master_path_override: str | Path | None = None,
    artifact_dir: str | Path | None = None,
    update_manifest: bool = True,
    timeout_seconds: int = 1800,
    progress_callback: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """Generate `pano_360.png` from a scene master image or text description."""

    def report(progress: float, message: str) -> None:
        if progress_callback:
            progress_callback(progress, message)

    project_dir = Path(project_dir)
    source = str(source or "").strip().lower()
    if source not in {"master", "text"}:
        raise ValueError("scene 360 source must be 'master' or 'text'")

    out_dir = (
        Path(artifact_dir) if artifact_dir else stage_manifest.stage_dir(project_dir, scene_id)
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    generation_dir = out_dir / "scene_360_generation"
    generation_dir.mkdir(parents=True, exist_ok=True)

    provider = "commercial"
    resolved_model = resolve_scene_360_image_model(model=model)
    style = (style or os.environ.get("SCENE_360_STYLE") or "realistic").strip()
    image_size = (image_size or os.environ.get("SCENE_360_IMAGE_SIZE") or "2K").strip()
    quality = (
        quality
        or os.environ.get("SCENE_360_IMAGE_QUALITY")
        or os.environ.get("HUIMENG_IMAGE_QUALITY")
        or "medium"
    ).strip()
    description = description.strip() or "\n".join(
        [
            f"场景名称：{scene_id}",
            "请生成 2:1 equirectangular 360 全景，用于 3GS 片场生成。",
            "只包含固定场景环境，不放人物、动作或剧情道具。",
            (
                "硬性要求：水平首尾闭合无缝；在 360 查看器里墙线、门窗、地面和天花板"
                "连续稳定；不要普通广角图、鱼眼、cubemap、多宫格、边框、文字水印、"
                "镜像重复、畸变拉伸、极点黑洞或断裂 seam。"
            ),
        ]
    )

    cmd = [
        *worker_command(SCENE_360_BUILDER_MODULE),
        "--scene-name",
        scene_id,
        "--output-dir",
        str(generation_dir),
        "--scene-description",
        description,
        "--style",
        style,
        "--image-size",
        image_size,
        "--quality",
        quality,
    ]
    cmd.extend(["--model", resolved_model])
    if str(model_selector or "").strip():
        cmd.extend(["--model-selector", str(model_selector).strip()])

    manifest_source = "text_to_360"
    master_path = ""
    reverse_master_path = ""
    overlap_analysis_path = ""
    spatial_contract_path = ""
    spatial_contract_model = (
        os.environ.get("SCENE_SPATIAL_CONTRACT_MODEL")
        or SPATIAL_CONTRACT_DEFAULT_MODEL
    )
    pano_correction_payload: dict[str, Any] | None = None
    if source == "master":
        master_path = (
            str(Path(master_path_override))
            if master_path_override
            else compute_scene_master_path(project_dir, scene_id)
        )
        if not master_path:
            source = "text"
        else:
            cmd.extend(["--master", master_path])
            reverse_master_path = (
                str(Path(reverse_master_path_override))
                if reverse_master_path_override
                else compute_scene_reverse_master_path(project_dir, scene_id) or ""
            )
            if reverse_master_path:
                cmd.extend(["--reverse-master", reverse_master_path])
                pano_correction_payload = {
                    "front_yaw_deg": 0.0,
                    "sphere_correction_deg": {
                        "yaw": SAFE_SEAM_SPHERE_YAW_DEG,
                        "pitch": 0.0,
                        "roll": 0.0,
                    },
                    "source": "scene_360_master_reverse_safe_seam",
                }
                analysis_path = (
                    Path(master_path).parent
                    / "overlap_continuation_test"
                    / "overlap_continuation_analysis.json"
                )
                overlap_analysis_path = str(analysis_path)
                latest_input_mtime = max(
                    Path(master_path).stat().st_mtime,
                    Path(reverse_master_path).stat().st_mtime,
                )
                needs_analysis = (
                    not analysis_path.exists() or analysis_path.stat().st_mtime < latest_input_mtime
                )
                if needs_analysis and model_access_configured():
                    report(0.12, "分析 master/reverse 侧边 overlap 和 continuation...")
                    analyzer_cmd = [
                        *worker_command(SCENE_OVERLAP_ANALYZER_MODULE),
                        "--scene-name",
                        scene_id,
                        "--master",
                        master_path,
                        "--reverse",
                        reverse_master_path,
                        "--output-dir",
                        str(analysis_path.parent),
                    ]
                    try:
                        analyzer_proc = run_project_model_subprocess(
                            analyzer_cmd,
                            capture_output=True,
                            text=True,
                            timeout=240,
                        )
                        if analyzer_proc.returncode != 0:
                            logger.warning(
                                "scene overlap analyzer failed for %s: %s",
                                scene_id,
                                (analyzer_proc.stderr or analyzer_proc.stdout or "")[-800:],
                            )
                    except (TaskCancelled, TaskTimedOut):
                        raise
                    except Exception as exc:
                        logger.warning("scene overlap analyzer failed for %s: %s", scene_id, exc)
                contract_path = (
                    Path(master_path).parent
                    / "scene_spatial_contract"
                    / "scene_spatial_contract.json"
                )
                spatial_contract_path = str(contract_path)
                contract_input_mtimes = [
                    Path(master_path).stat().st_mtime,
                    Path(reverse_master_path).stat().st_mtime,
                ]
                if analysis_path.exists():
                    contract_input_mtimes.append(analysis_path.stat().st_mtime)
                latest_contract_input_mtime = max(contract_input_mtimes)
                needs_contract = (
                    not contract_path.exists()
                    or contract_path.stat().st_mtime < latest_contract_input_mtime
                    or not _json_file_has_schema(
                        contract_path,
                        SPATIAL_CONTRACT_SCHEMA_VERSION,
                    )
                )
                if needs_contract and model_access_configured():
                    report(0.14, f"分析 master/reverse 空间合同 ({spatial_contract_model})...")
                    contract_cmd = [
                        *worker_command(SCENE_SPATIAL_CONTRACT_MODULE),
                        "--scene-name",
                        scene_id,
                        "--master",
                        master_path,
                        "--reverse",
                        reverse_master_path,
                        "--output-dir",
                        str(contract_path.parent),
                        "--overlap-analysis",
                        str(analysis_path),
                    ]
                    try:
                        contract_proc = run_project_model_subprocess(
                            contract_cmd,
                            capture_output=True,
                            text=True,
                            timeout=240,
                        )
                        if contract_proc.returncode != 0:
                            logger.warning(
                                "scene spatial contract failed for %s: %s",
                                scene_id,
                                (contract_proc.stderr or contract_proc.stdout or "")[-800:],
                            )
                    except (TaskCancelled, TaskTimedOut):
                        raise
                    except Exception as exc:
                        logger.warning("scene spatial contract failed for %s: %s", scene_id, exc)
            manifest_source = "uploaded_master"
    if source == "text":
        cmd.append("--text-only")

    generated = generation_dir / "scene_panorama_2to1.png"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    if generated.exists():
        generated.replace(generation_dir / f"scene_panorama_2to1_{timestamp}.png")

    report(0.20, f"启动 {provider} 生成 {image_size}/{quality} 360 全景...")
    logger.info(
        "scene_360 start: scene_id=%s source=%s provider=%s model=%s image_size=%s "
        "quality=%s style=%s has_master=%s has_reverse_master=%s text_only=%s timeout_seconds=%s",
        scene_id,
        source,
        provider,
        resolved_model,
        image_size,
        quality,
        style,
        bool(master_path),
        bool(reverse_master_path),
        source == "text",
        timeout_seconds,
    )
    logger.info("running scene 360 generator: %s", " ".join(cmd[:2] + ["..."]))
    reservation_id = _reserve_scene_360_model_call(
        resolved_model,
        provider=provider,
        image_size=image_size,
        quality=quality,
    )
    try:
        proc = run_project_model_subprocess(
            cmd,
            capture_output=True,
            text=True,
            timeout=int(timeout_seconds),
        )
        if proc.returncode != 0:
            message = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(f"360 全景生成失败: {message[-1200:]}")

        if not generated.exists():
            raise RuntimeError(f"360 生成器成功退出，但没有写出结果: {generated}")

        provider_trace = _read_scene_360_provider_trace(generation_dir)
        pano_path = out_dir / "pano_360.png"
        archived: Path | None = None
        if update_manifest and pano_path.exists():
            archived = pano_path.with_name(f"pano_360_{timestamp}.png")
            pano_path.replace(archived)
        shutil.copy2(generated, pano_path)

        report(
            0.90,
            "pano_360.png 已写入 3GS 资产包" if update_manifest else "360 全景候选已写入画布输出",
        )
        if update_manifest:
            stage_manifest.update_manifest(
                project_dir,
                scene_id,
                clear_fields=[
                    "ply_path",
                    "pano_ply_path",
                    "collision_glb_path",
                    "voxel_json_path",
                    "pano_sharp_args",
                    "single_face_sharp_args",
                    "splat_transform_args",
                ],
                pano_path=pano_path.name,
                source=manifest_source,
                scene_360_args={
                    "provider": provider,
                    "model": resolved_model,
                    "style": style,
                    "image_size": image_size,
                    "quality": quality,
                    "source": source,
                    "topology": "master_reverse_safe_side_seam" if pano_correction_payload else "",
                    "master_path": master_path,
                    "reverse_master_path": reverse_master_path,
                    "spatial_contract_path": spatial_contract_path,
                    "spatial_contract_model": (
                        spatial_contract_model if spatial_contract_path else ""
                    ),
                    "overlap_analysis_path": overlap_analysis_path,
                },
                pano_correction=pano_correction_payload,
            )
        result = {
            "ok": True,
            "scene_id": scene_id,
            "pano_path": str(pano_path),
            "output_path": str(pano_path),
            "source": manifest_source,
            "provider": provider,
            "model": resolved_model,
            "image_size": image_size,
            "quality": quality,
            "generation_dir": str(generation_dir),
            "archived_path": str(archived) if archived else None,
            "manifest_updated": bool(update_manifest),
            "pano_correction": pano_correction_payload,
            "request_id": provider_trace.get("request_id", ""),
            "provider_task_id": provider_trace.get("provider_task_id", ""),
            "response_id": provider_trace.get("response_id", ""),
            "ran_at": datetime.now(timezone.utc).isoformat(),
            "stdout_tail": (proc.stdout or "")[-2000:],
        }
    except BaseException as exc:
        _refund_scene_360_model_call(
            reservation_id,
            provider=provider,
            error=exc.__class__.__name__,
        )
        raise

    _confirm_scene_360_model_call(
        model=resolved_model,
        reservation_id=reservation_id,
        provider=provider,
        provider_request_id=provider_trace.get("request_id", ""),
        provider_task_id=provider_trace.get("provider_task_id", ""),
        provider_response_id=provider_trace.get("response_id", ""),
    )
    return result



__all__ = ["resolve_scene_360_image_model", "run_scene_360"]
