"""项目 CRUD 端点。"""

import asyncio
import logging
import time
from io import BytesIO
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from fastapi.responses import JSONResponse

from ai_anime.api.routes.identity_access.dependencies import get_api_user, require_scope
from ai_anime.api.deps import (
    make_sqlite_store_for_context,
    make_static_url_for_context,
)
from ai_anime.api.routes.project_workspace.schemas import (
    NarratorVoiceBindRequest,
    NarratorVoiceDesignRequest,
    NarratorVoicePresetGenerateRequest,
    NarratorVoiceRecordRequest,
    NarratorVoiceTrimRequest,
    ProjectCreate,
    ProjectCoverSelectRequest,
    ProjectStatusFilter,
    ProjectUpdate,
)
from ai_anime.modules.project_workspace.public import (
    default_aspect_ratio_for_spine_template,
    load_effective_narration_style_for_voice,
    load_narrator_reference_audio,
    load_project_config_from_state_dir,
    persist_narrator_voice_content,
    save_project_config_in_state_dir,
)
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    ProjectLifecycleAction,
    change_project_status,
    clear_narrator_voice_content,
    create_project_workspace,
    get_project_details,
    list_project_summaries as query_project_summaries,
    list_project_workspaces,
    purge_project_workspace,
    require_project_home_node,
    resolve_project_context,
)
from ai_anime.modules.asset_world.public import (
    decode_recorded_audio_data_url,
    is_supported_voice_sample,
    trim_voice_sample_content,
)
from ai_anime.modules.production.public import (
    DEFAULT_NARRATION_STYLE,
    NARRATION_STYLES,
    resolve_narrator_source,
)
from ai_anime.modules.creative_canvas.public import (
    StartCreativeCanvasPresetVoiceCommand,
    StartCreativeCanvasVoiceDesignCommand,
    creative_canvas_audio_generation_use_cases,
)
from ai_anime.shared.utils.async_ops import call_blocking
from ai_anime.shared.utils.voice_samples import SUPPORTED_VOICE_SAMPLE_MESSAGE

logger = logging.getLogger("ai_anime.api.projects")

router = APIRouter()
NARRATOR_VOICE_MODE_EXPLANATION = (
    "第一人称解说使用解说主角声线；第三人称解说使用项目解说声线。"
)
PROJECT_COVER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
PROJECT_COVER_MAX_BYTES = 12 * 1024 * 1024
PROJECT_COVER_CACHE_TTL_SECONDS = 15.0
PROJECT_COVER_CACHE_MAX_ENTRIES = 64
_project_cover_cache: dict[str, tuple[float, list[tuple[float, Path]]]] = {}
_project_cover_cache_lock = Lock()


def _project_relative_path(project_dir: str | Path, path: str | Path) -> str:
    return Path(path).resolve().relative_to(Path(project_dir).resolve()).as_posix()


def _project_cover_target(project_dir: str | Path) -> Path:
    return Path(project_dir) / "assets" / "project" / "cover.webp"


def _save_project_cover(project_dir: Path, content: bytes) -> Path:
    from PIL import Image, UnidentifiedImageError

    if not content:
        raise ValueError("封面图片内容为空")
    if len(content) > PROJECT_COVER_MAX_BYTES:
        raise ValueError("封面图片不能超过 12 MB")
    try:
        with Image.open(BytesIO(content)) as source:
            source.verify()
        with Image.open(BytesIO(content)) as source:
            image = source.convert("RGB")
            image.thumbnail((1920, 1920))
            target = _project_cover_target(project_dir)
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, format="WEBP", quality=90, method=6)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError("请选择有效的 PNG、JPG 或 WebP 图片") from exc
    return target


def _resolve_project_cover_source(project_dir: Path, source_path: str) -> Path:
    candidate = (project_dir / source_path).resolve()
    try:
        candidate.relative_to(project_dir.resolve())
    except ValueError as exc:
        raise ValueError("请选择当前项目内的图片") from exc
    if (
        not candidate.is_file()
        or candidate.suffix.lower() not in PROJECT_COVER_EXTENSIONS
    ):
        raise ValueError("请选择当前项目内的有效图片")
    return candidate


def _scan_project_cover_images(project_dir: Path) -> list[tuple[float, Path]]:
    cover_target = _project_cover_target(project_dir).resolve()
    images: list[tuple[float, Path]] = []
    for root_name in (
        "renders",
        "images",
        "frames",
        "sketches",
        "freezone",
        "uploads",
        "assets",
    ):
        root = project_dir / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix.lower() not in PROJECT_COVER_EXTENSIONS:
                continue
            try:
                if not path.is_file() or path.resolve() == cover_target:
                    continue
                images.append((path.stat().st_mtime, path))
            except OSError:
                # A generation task can replace a file while this snapshot is built.
                continue
    images.sort(key=lambda item: (item[0], item[1].as_posix()), reverse=True)
    return images


def _cached_project_cover_images(project_dir: Path) -> list[tuple[float, Path]]:
    cache_key = str(project_dir.resolve())
    now = time.monotonic()
    with _project_cover_cache_lock:
        cached = _project_cover_cache.get(cache_key)
        if cached is not None and now - cached[0] < PROJECT_COVER_CACHE_TTL_SECONDS:
            return cached[1]

    images = _scan_project_cover_images(project_dir)
    with _project_cover_cache_lock:
        expired = [
            key
            for key, (created_at, _) in _project_cover_cache.items()
            if now - created_at >= PROJECT_COVER_CACHE_TTL_SECONDS
        ]
        for key in expired:
            _project_cover_cache.pop(key, None)
        if len(_project_cover_cache) >= PROJECT_COVER_CACHE_MAX_ENTRIES:
            oldest_key = min(
                _project_cover_cache,
                key=lambda key: _project_cover_cache[key][0],
            )
            _project_cover_cache.pop(oldest_key, None)
        _project_cover_cache[cache_key] = (now, images)
    return images


def _project_cover_candidates(
    ctx: ProjectContext,
    *,
    page: int,
    page_size: int,
) -> dict[str, object]:
    project_dir = Path(ctx.output_dir)
    images = _cached_project_cover_images(project_dir)
    start = (page - 1) * page_size
    selected = images[start : start + page_size]
    result: list[dict[str, str]] = []
    for _, path in selected:
        try:
            relative = _project_relative_path(project_dir, path)
            result.append(
                {
                    "path": relative,
                    "name": path.name,
                    "url": make_static_url_for_context(
                        ctx,
                        relative,
                        local_path=path,
                    ),
                }
            )
        except OSError:
            continue
    total = len(images)
    return {
        "items": result,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "has_more": start + page_size < total,
    }


def _narrator_identity_detail(resolution) -> str:
    if not resolution.character_name:
        return "未配置解说主角"
    if resolution.identity_name:
        return f"{resolution.character_name}（{resolution.identity_name}）"
    if resolution.identity_id:
        return f"{resolution.character_name}（{resolution.identity_id}）"
    return resolution.character_name


def _narrator_voice_display_lines(
    style: str,
    resolution,
    project_dir: str | Path,
) -> dict[str, str]:
    if style == "first_person":
        detail = _narrator_identity_detail(resolution)
        return {
            "heading": "第一人称解说主角声线",
            "detail": f"当前为第一人称：使用 {detail}",
            "explanation": NARRATOR_VOICE_MODE_EXPLANATION,
        }

    if resolution.audio_path:
        detail = _project_relative_path(project_dir, resolution.audio_path)
    else:
        detail = resolution.error or "第三人称项目解说声线未配置"
    return {
        "heading": "第三人称项目解说声线",
        "detail": detail,
        "explanation": "第三人称解说使用项目级声线；所有非对白 Beat 使用同一声线。",
    }


def _effective_narrator_voice_style(username: str, project: str) -> str:
    return (
        load_effective_narration_style_for_voice(username, project)
        or DEFAULT_NARRATION_STYLE
    )


def _narrator_voice_payload(ctx: ProjectContext, store) -> dict:
    style = _effective_narrator_voice_style(ctx.owner_username, ctx.project_name)
    stored = load_narrator_reference_audio(ctx.owner_username, ctx.project_name)
    resolution = resolve_narrator_source(
        store=store,
        narration_style=style,
        project_narrator_stored_path=stored.get("path", ""),
    )
    project_dir = Path(ctx.output_dir)
    display = _narrator_voice_display_lines(style, resolution, project_dir)
    rel_path = (
        _project_relative_path(project_dir, resolution.audio_path)
        if resolution.audio_path
        else ""
    )
    reference_sha256 = resolution.sha256
    if resolution.source == "project_narrator":
        reference_sha256 = reference_sha256 or stored.get("sha256", "")
    return {
        "narration_style": style,
        "style_label": NARRATION_STYLES.get(
            style, NARRATION_STYLES[DEFAULT_NARRATION_STYLE]
        )["label"],
        "source": resolution.source or "",
        "reference_path": rel_path,
        "reference_url": (
            make_static_url_for_context(ctx, rel_path, local_path=resolution.audio_path)
            if rel_path and resolution.audio_path
            else ""
        ),
        "reference_sha256": reference_sha256,
        "reference_updated_at": stored.get("updated_at", ""),
        "heading": display["heading"],
        "detail": display["detail"],
        "explanation": display["explanation"],
        "character_name": resolution.character_name,
        "identity_id": resolution.identity_id,
        "identity_name": resolution.identity_name,
        "error": resolution.error,
        "is_first_person": style == "first_person",
    }


def _ensure_third_person_narrator(username: str, project: str) -> None:
    style = _effective_narrator_voice_style(username, project)
    if style == "first_person":
        raise ValueError(NARRATOR_VOICE_MODE_EXPLANATION)


def _create_reusable_voice(
    *,
    context: ProjectContext,
    name: str,
    filename: str,
    content: bytes,
    mime_type: str,
) -> dict:
    from ai_anime.modules.creative_canvas.public import (
        CreateCreativeCanvasAudioVoiceCommand,
        creative_canvas_audio_library_use_cases,
    )

    return dict(
        creative_canvas_audio_library_use_cases().create_voice(
            CreateCreativeCanvasAudioVoiceCommand(
                context=context,
                name=name,
                filename=filename,
                content=content,
                mime_type=mime_type,
            )
        )
    )


def _trim_narrator_voice_content(
    *,
    username: str,
    project: str,
    project_dir: Path,
    start_seconds: float,
    duration_seconds: float,
) -> Path:
    stored = load_narrator_reference_audio(username, project)
    source = Path(stored.get("path", ""))
    if not str(source):
        raise ValueError("请先上传解说声线")
    if not source.is_absolute():
        source = project_dir / source
    source = source.resolve()
    try:
        source.relative_to(project_dir.resolve())
    except ValueError as exc:
        raise ValueError("请选择项目内有效的音频文件") from exc
    if (
        not source.exists()
        or not source.is_file()
        or not is_supported_voice_sample(source.name)
    ):
        raise ValueError("请选择项目内有效的音频文件")

    content, _filename = trim_voice_sample_content(
        source.read_bytes(),
        filename=source.name,
        start_seconds=start_seconds,
        duration_seconds=duration_seconds,
    )
    return persist_narrator_voice_content(
        username=username,
        project=project,
        project_dir=project_dir,
        filename="voice.mp3",
        content=content,
    )


@router.get("/projects")
async def list_projects(user: dict = Depends(get_api_user)):
    """List project_ids accessible to the current user."""
    projects = await list_project_workspaces(user)
    return {
        "ok": True,
        "data": [project.payload() for project in projects],
    }


@router.get("/projects/summaries")
async def list_project_summaries(
    status: ProjectStatusFilter = Query("visible"),
    user: dict = Depends(get_api_user),
):
    """List summaries for projects accessible to the current user."""
    summaries = await query_project_summaries(user, status=status)
    return {
        "ok": True,
        "data": [summary.payload(omit_empty_purged_at=True) for summary in summaries],
    }


@router.post("/projects")
async def create_project(
    body: ProjectCreate, user: dict = Depends(require_scope("projects:write"))
):
    """创建新项目。"""
    logger.info("create_project: %s", body.name)
    record = await create_project_workspace(
        user,
        name=body.name,
    )
    return {
        "ok": True,
        "data": {"id": record.id, "project_id": record.id, "name": body.name},
    }


@router.get("/projects/{project}")
async def get_project(project: str, user: dict = Depends(get_api_user)):
    """获取项目配置。"""
    return {
        "ok": True,
        "data": await get_project_details(user, project_id=project),
    }


@router.get("/projects/{project}/static-auth", include_in_schema=False)
async def authorize_project_static_media(
    project: str, user: dict = Depends(get_api_user)
):
    await resolve_project_context(user=user, project_id=project, required_role="viewer")
    return Response(status_code=204)


@router.patch("/projects/{project}")
async def update_project(
    project: str,
    body: ProjectUpdate,
    user: dict = Depends(require_scope("projects:write")),
):
    """更新项目配置。"""
    logger.info(
        "[%s] update_project: %s",
        project,
        list(body.model_dump(exclude_none=True).keys()),
    )
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    require_project_home_node(ctx, operation="update project config")
    updates = body.model_dump(exclude_none=True)
    current_config = load_project_config_from_state_dir(
        ctx.state_dir,
        username=ctx.owner_username,
        project=ctx.project_name,
    )

    if body.spine_template is not None and body.spine_template != current_config.get(
        "spine_template", "drama"
    ):
        store = await make_sqlite_store_for_context(ctx)
        try:
            imported = bool(store.get_all_episodes())
        finally:
            close = getattr(store, "close", None)
            if close:
                await close()
        if imported:
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": "项目类型已锁定；如需切换请重新导入",
                },
            )
        if body.aspect_ratio is None:
            updates["aspect_ratio"] = default_aspect_ratio_for_spine_template(
                body.spine_template
            )

    # 校验 visual_style 合法性
    if body.visual_style is not None:
        from ai_anime.modules.asset_world.public import StyleService

        valid = StyleService.get_style_labels(username=ctx.owner_username)
        if body.visual_style not in valid:
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": (
                        f"Invalid visual_style: '{body.visual_style}'. "
                        f"Valid: {list(valid.keys())}"
                    ),
                },
            )

    if updates:
        save_project_config_in_state_dir(ctx.state_dir, config=updates)
    config = load_project_config_from_state_dir(
        ctx.state_dir,
        username=ctx.owner_username,
        project=ctx.project_name,
    )
    return {"ok": True, "data": config}


@router.get("/projects/{project}/cover/candidates")
async def list_project_cover_candidates(
    project: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=30),
    user: dict = Depends(get_api_user),
):
    """列出当前项目内可作为封面的历史图片。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="viewer"
    )
    require_project_home_node(ctx, operation="list project cover candidates")
    data = await asyncio.to_thread(
        _project_cover_candidates,
        ctx,
        page=page,
        page_size=page_size,
    )
    return {"ok": True, "data": data}


@router.post("/projects/{project}/cover/upload")
async def upload_project_cover(
    project: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_scope("projects:write")),
):
    """上传外部图片并保存为项目封面。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    require_project_home_node(ctx, operation="upload project cover")
    try:
        content = await file.read()
        target = await asyncio.to_thread(
            _save_project_cover,
            Path(ctx.output_dir),
            content,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    relative = _project_relative_path(ctx.output_dir, target)
    save_project_config_in_state_dir(ctx.state_dir, config={"cover_path": relative})
    return {
        "ok": True,
        "data": {
            "path": relative,
            "url": make_static_url_for_context(ctx, relative, local_path=target),
        },
    }


@router.post("/projects/{project}/cover/select")
async def select_project_cover(
    project: str,
    body: ProjectCoverSelectRequest,
    user: dict = Depends(require_scope("projects:write")),
):
    """复制一张项目历史图片作为项目封面。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    require_project_home_node(ctx, operation="select project cover")
    try:
        source = _resolve_project_cover_source(Path(ctx.output_dir), body.source_path)
        content = await asyncio.to_thread(source.read_bytes)
        target = await asyncio.to_thread(
            _save_project_cover,
            Path(ctx.output_dir),
            content,
        )
    except (OSError, ValueError) as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    relative = _project_relative_path(ctx.output_dir, target)
    save_project_config_in_state_dir(ctx.state_dir, config={"cover_path": relative})
    return {
        "ok": True,
        "data": {
            "path": relative,
            "url": make_static_url_for_context(ctx, relative, local_path=target),
        },
    }


@router.get("/projects/{project}/narrator-voice")
async def get_narrator_voice(
    project: str,
    user: dict = Depends(get_api_user),
):
    """获取项目解说声线状态。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="viewer"
    )
    store = await make_sqlite_store_for_context(ctx)
    return {
        "ok": True,
        "data": _narrator_voice_payload(ctx, store),
    }


@router.post("/projects/{project}/narrator-voice/upload")
async def upload_narrator_voice(
    project: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """上传第三人称项目解说声线。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    store = await make_sqlite_store_for_context(ctx)
    try:
        _ensure_third_person_narrator(ctx.owner_username, ctx.project_name)
        content = await file.read()
        filename = file.filename or "voice.wav"
        if not is_supported_voice_sample(filename):
            raise ValueError(
                f"{SUPPORTED_VOICE_SAMPLE_MESSAGE}（收到：{filename}）"
            )
        if not content:
            raise ValueError("音频内容为空")
        created_voice = await call_blocking(
            _create_reusable_voice,
            context=ctx,
            name=Path(filename).stem or "第三人称旁白",
            filename=filename,
            content=content,
            mime_type=file.content_type or "application/octet-stream",
        )
        await call_blocking(
            persist_narrator_voice_content,
            username=ctx.owner_username,
            project=ctx.project_name,
            project_dir=ctx.output_dir,
            filename=filename,
            content=content,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    data = _narrator_voice_payload(ctx, store)
    data["voice_library_id"] = str(created_voice.get("voice_id") or "")
    return {
        "ok": True,
        "data": data,
    }


@router.post("/projects/{project}/narrator-voice/record")
async def record_narrator_voice(
    project: str,
    body: NarratorVoiceRecordRequest,
    user: dict = Depends(get_api_user),
):
    """保存浏览器录音为第三人称项目解说声线。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    store = await make_sqlite_store_for_context(ctx)
    try:
        _ensure_third_person_narrator(ctx.owner_username, ctx.project_name)
        content, extension = await call_blocking(
            decode_recorded_audio_data_url,
            body.data_url,
        )
        created_voice = await call_blocking(
            _create_reusable_voice,
            context=ctx,
            name="第三人称旁白录音",
            filename=f"recorded{extension}",
            content=content,
            mime_type=("audio/mpeg" if extension == ".mp3" else "audio/wav"),
        )
        await call_blocking(
            persist_narrator_voice_content,
            username=ctx.owner_username,
            project=ctx.project_name,
            project_dir=ctx.output_dir,
            filename=f"recorded{extension}",
            content=content,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    data = _narrator_voice_payload(ctx, store)
    data["voice_library_id"] = str(created_voice.get("voice_id") or "")
    return {
        "ok": True,
        "data": data,
    }


@router.post("/projects/{project}/narrator-voice/generate-preset")
async def generate_preset_narrator_voice(
    project: str,
    body: NarratorVoicePresetGenerateRequest,
    user: dict = Depends(get_api_user),
):
    """提交 AUDIO_SPEECH 预设声线生成与项目解说绑定任务。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    try:
        _ensure_third_person_narrator(ctx.owner_username, ctx.project_name)
        receipt = await creative_canvas_audio_generation_use_cases().start_preset_voice(
            StartCreativeCanvasPresetVoiceCommand(
                context=ctx,
                project_dir=Path(ctx.output_dir),
                name=body.name or body.voice or "AI 解说声线",
                model_selector=body.model_selector,
                voice=body.voice,
                text=body.text,
                binding={"kind": "project_narrator"},
            )
        )
    except (OSError, RuntimeError, ValueError) as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "task_type": receipt.task_type,
        "task_id": receipt.task_id,
        "task_key": receipt.task_key,
        "scope": receipt.task_scope,
        "message": "项目解说预设声线生成已进入队列",
    }


@router.post("/projects/{project}/narrator-voice/design")
async def design_narrator_voice(
    project: str,
    body: NarratorVoiceDesignRequest,
    user: dict = Depends(get_api_user),
):
    """提交 AUDIO_VOICE_DESIGN 声线生成与项目解说绑定任务。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    try:
        _ensure_third_person_narrator(ctx.owner_username, ctx.project_name)
        receipt = await creative_canvas_audio_generation_use_cases().start_voice_design(
            StartCreativeCanvasVoiceDesignCommand(
                context=ctx,
                project_dir=Path(ctx.output_dir),
                name=body.name or body.voice_prompt[:80],
                model_selector=body.model_selector,
                voice_prompt=body.voice_prompt,
                preview_text=body.preview_text,
                preferred_name=body.preferred_name or "custom_voice",
                language=body.language,
                sample_rate=body.sample_rate,
                response_format=body.response_format,
                binding={"kind": "project_narrator"},
            )
        )
    except (OSError, RuntimeError, ValueError) as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "task_type": receipt.task_type,
        "task_id": receipt.task_id,
        "task_key": receipt.task_key,
        "scope": receipt.task_scope,
        "message": "项目解说文字声线设计已进入队列",
    }


@router.post("/projects/{project}/narrator-voice/bind")
async def bind_account_voice_as_narrator_voice(
    project: str,
    body: NarratorVoiceBindRequest,
    user: dict = Depends(get_api_user),
):
    """将账号声线库中的声线绑定为第三人称项目解说声线。"""
    from ai_anime.modules.creative_canvas.public import (
        CreativeCanvasAudioVoiceMissing,
        GetCreativeCanvasAudioVoiceQuery,
        creative_canvas_audio_library_use_cases,
    )

    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    store = await make_sqlite_store_for_context(ctx)
    try:
        _ensure_third_person_narrator(ctx.owner_username, ctx.project_name)
        source_path = creative_canvas_audio_library_use_cases().get_voice(
            GetCreativeCanvasAudioVoiceQuery(
                context=ctx,
                voice_id=body.voice_id,
            )
        )
        await call_blocking(
            persist_narrator_voice_content,
            username=ctx.owner_username,
            project=ctx.project_name,
            project_dir=ctx.output_dir,
            filename=source_path.name,
            content=await call_blocking(source_path.read_bytes),
        )
    except (CreativeCanvasAudioVoiceMissing, ValueError, OSError) as exc:
        return {"ok": False, "error": str(exc)}
    data = _narrator_voice_payload(ctx, store)
    data["voice_library_id"] = body.voice_id
    return {
        "ok": True,
        "data": data,
    }


@router.post("/projects/{project}/narrator-voice/trim")
async def trim_narrator_voice(
    project: str,
    body: NarratorVoiceTrimRequest,
    user: dict = Depends(get_api_user),
):
    """裁剪第三人称项目解说声线并写回项目声线槽位。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    store = await make_sqlite_store_for_context(ctx)
    try:
        _ensure_third_person_narrator(ctx.owner_username, ctx.project_name)
        await call_blocking(
            _trim_narrator_voice_content,
            username=ctx.owner_username,
            project=ctx.project_name,
            project_dir=ctx.output_dir,
            start_seconds=body.start_seconds,
            duration_seconds=body.duration_seconds,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "data": _narrator_voice_payload(ctx, store),
    }


@router.post("/projects/{project}/narrator-voice/delete")
async def delete_narrator_voice(
    project: str,
    user: dict = Depends(get_api_user),
):
    """移除第三人称项目解说声线。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    store = await make_sqlite_store_for_context(ctx)
    stored = load_narrator_reference_audio(ctx.owner_username, ctx.project_name)
    await call_blocking(
        clear_narrator_voice_content,
        username=ctx.owner_username,
        project=ctx.project_name,
        project_dir=ctx.output_dir,
        stored_path=stored.get("path", ""),
    )
    return {
        "ok": True,
        "data": _narrator_voice_payload(ctx, store),
    }


@router.post("/projects/{project}/archive")
async def archive_project(
    project: str,
    user: dict = Depends(require_scope("projects:write")),
):
    summary = await change_project_status(
        user,
        project_id=project,
        action=ProjectLifecycleAction.ARCHIVE,
    )
    return {"ok": True, "data": summary.payload()}


@router.post("/projects/{project}/unarchive")
async def unarchive_project(
    project: str,
    user: dict = Depends(require_scope("projects:write")),
):
    summary = await change_project_status(
        user,
        project_id=project,
        action=ProjectLifecycleAction.UNARCHIVE,
    )
    return {"ok": True, "data": summary.payload()}


@router.post("/projects/{project}/delete")
async def soft_delete_project(
    project: str,
    user: dict = Depends(require_scope("projects:write")),
):
    summary = await change_project_status(
        user,
        project_id=project,
        action=ProjectLifecycleAction.DELETE,
    )
    return {"ok": True, "data": summary.payload()}


@router.post("/projects/{project}/restore")
async def restore_project(
    project: str,
    user: dict = Depends(require_scope("projects:write")),
):
    summary = await change_project_status(
        user,
        project_id=project,
        action=ProjectLifecycleAction.RESTORE,
    )
    return {"ok": True, "data": summary.payload()}


@router.post("/projects/{project}/purge")
async def purge_project(
    project: str,
    user: dict = Depends(require_scope("projects:write")),
):
    """永久删除项目目录；只允许对已进入回收站的项目执行。"""
    record = await purge_project_workspace(user, project_id=project)
    return {
        "ok": True,
        "data": {
            "name": project,
            "status": "deleted",
            "deleted_at": None,
            "purged_at": record.purged_at,
            "archived_at": None,
            "updated_at": None,
            "episode_count": None,
            "beat_count": None,
        },
    }
