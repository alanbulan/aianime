"""项目 CRUD 端点。"""

import logging
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from fastapi.responses import JSONResponse

from ai_anime.api.auth import get_api_user, require_scope
from ai_anime.api.deps import (
    make_sqlite_store_for_context,
    make_static_url_for_context,
)
from ai_anime.api.projects_schemas import (
    ProjectCreate,
    ProjectStatusFilter,
    ProjectUpdate,
)
from ai_anime.api.voice_schemas import (
    CharacterVoiceRecordRequest,
    NarratorVoiceCopyRequest,
    NarratorVoiceTrimRequest,
)
from ai_anime.project_config import (
    default_aspect_ratio_for_spine_template,
    load_effective_narration_style_for_voice,
    load_narrator_reference_audio,
    load_project_config_from_state_dir,
    save_project_config_in_state_dir,
    set_narrator_reference_audio,
)
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    ProjectLifecycleAction,
    change_project_status,
    create_project_workspace,
    get_project_details,
    list_project_summaries as query_project_summaries,
    list_project_workspaces,
    purge_project_workspace,
    require_project_home_node,
    resolve_project_context,
)
from ai_anime.modules.asset_world.public import (
    VOICE_SAMPLE_EXTENSIONS,
    decode_recorded_audio_data_url,
    is_supported_voice_sample,
    trim_voice_sample_content,
    voice_content_sha256,
    voice_sample_extension,
)
from ai_anime.modules.seedance2_i2v.voice_clone import (
    DEFAULT_NARRATION_STYLE,
    NARRATION_STYLES,
    resolve_narrator_source,
)

logger = logging.getLogger("ai_anime.api.projects")

router = APIRouter()
VOICE_SOURCE_ROOTS = ("audio", "seedance2_uploads", "assets", "uploads")
NARRATOR_VOICE_MODE_EXPLANATION = (
    "第一人称解说使用解说主角声线；第三人称解说使用项目解说声线。"
)
SUPPORTED_VOICE_SAMPLE_COPY = "仅支持 mp3 / wav / m4a / aac / ogg"


def _project_relative_path(project_dir: str | Path, path: str | Path) -> str:
    return Path(path).resolve().relative_to(Path(project_dir).resolve()).as_posix()


def _narrator_voice_sample_path(project_dir: str | Path, filename: str) -> Path:
    ext = voice_sample_extension(filename)
    return Path(project_dir) / "assets" / "narrator" / f"voice{ext}"


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


def _persist_narrator_voice_content(
    *,
    username: str,
    project: str,
    project_dir: Path,
    filename: str,
    content: bytes,
) -> Path:
    if not is_supported_voice_sample(filename):
        raise ValueError(
            f"{SUPPORTED_VOICE_SAMPLE_COPY}（收到：{filename or '未知文件'}）"
        )
    if not content:
        raise ValueError("音频内容为空")

    target = _narrator_voice_sample_path(project_dir, filename)
    target.parent.mkdir(parents=True, exist_ok=True)
    for ext in VOICE_SAMPLE_EXTENSIONS:
        existing = target.with_suffix(ext)
        if existing.exists():
            existing.replace(
                existing.with_name(
                    f"{existing.stem}_{int(time.time())}{existing.suffix}"
                )
            )
    target.write_bytes(content)
    set_narrator_reference_audio(
        username,
        project,
        relative_path=_project_relative_path(project_dir, target),
        sha256=voice_content_sha256(content),
    )
    return target


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
        or source.suffix.lower() not in VOICE_SAMPLE_EXTENSIONS
    ):
        raise ValueError("请选择项目内有效的音频文件")

    content, _filename = trim_voice_sample_content(
        source.read_bytes(),
        filename=source.name,
        start_seconds=start_seconds,
        duration_seconds=duration_seconds,
    )
    target = project_dir / "assets" / "narrator" / "voice.mp3"
    target.parent.mkdir(parents=True, exist_ok=True)
    for ext in VOICE_SAMPLE_EXTENSIONS:
        sibling = target.with_suffix(ext)
        if sibling.exists():
            sibling.replace(
                sibling.with_name(f"{sibling.stem}_{int(time.time())}{sibling.suffix}")
            )
    target.write_bytes(content)
    set_narrator_reference_audio(
        username,
        project,
        relative_path=_project_relative_path(project_dir, target),
        sha256=voice_content_sha256(content),
    )
    return target


def _project_voice_source_label(rel_path: str) -> str:
    filename = Path(rel_path).name
    if rel_path.startswith("audio/"):
        return f"已生成音频 · {filename}"
    if rel_path.startswith("assets/"):
        return f"资产音频 · {filename}"
    return f"{filename} · {rel_path}"


def _project_voice_source_options(project_dir: str | Path) -> list[dict[str, str]]:
    project_path = Path(project_dir)
    options: list[dict[str, str]] = []
    seen: set[str] = set()
    for root_name in VOICE_SOURCE_ROOTS:
        root = project_path / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in VOICE_SAMPLE_EXTENSIONS:
                continue
            rel_path = _project_relative_path(project_path, path)
            if rel_path in seen:
                continue
            seen.add(rel_path)
            options.append(
                {
                    "label": _project_voice_source_label(rel_path),
                    "path": str(path),
                    "rel_path": rel_path,
                }
            )
    return sorted(options, key=lambda item: item["rel_path"])


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

        valid = StyleService.get_style_labels(
            username=ctx.owner_username, project=ctx.project_name
        )
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


@router.get("/projects/{project}/narrator-voice/sources")
async def list_narrator_voice_sources(project: str, user: dict = Depends(get_api_user)):
    """列出项目内可复制为解说声线的音频。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="viewer"
    )
    require_project_home_node(ctx, operation="list project voice files")
    return {
        "ok": True,
        "data": {"options": _project_voice_source_options(ctx.output_dir)},
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
        _persist_narrator_voice_content(
            username=ctx.owner_username,
            project=ctx.project_name,
            project_dir=ctx.output_dir,
            filename=file.filename or "",
            content=content,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "data": _narrator_voice_payload(ctx, store),
    }


@router.post("/projects/{project}/narrator-voice/record")
async def record_narrator_voice(
    project: str,
    body: CharacterVoiceRecordRequest,
    user: dict = Depends(get_api_user),
):
    """保存浏览器录音为第三人称项目解说声线。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    store = await make_sqlite_store_for_context(ctx)
    try:
        _ensure_third_person_narrator(ctx.owner_username, ctx.project_name)
        content, extension = decode_recorded_audio_data_url(body.data_url)
        _persist_narrator_voice_content(
            username=ctx.owner_username,
            project=ctx.project_name,
            project_dir=ctx.output_dir,
            filename=f"recorded{extension}",
            content=content,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "data": _narrator_voice_payload(ctx, store),
    }


@router.post("/projects/{project}/narrator-voice/copy")
async def copy_project_audio_as_narrator_voice(
    project: str,
    body: NarratorVoiceCopyRequest,
    user: dict = Depends(get_api_user),
):
    """从项目内已有音频复制为第三人称项目解说声线。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    store = await make_sqlite_store_for_context(ctx)
    try:
        _ensure_third_person_narrator(ctx.owner_username, ctx.project_name)
        raw_path = Path(body.source_path)
        source_path = raw_path if raw_path.is_absolute() else ctx.output_dir / raw_path
        source_path = source_path.resolve()
        source_path.relative_to(ctx.output_dir.resolve())
        if (
            not source_path.exists()
            or source_path.suffix.lower() not in VOICE_SAMPLE_EXTENSIONS
        ):
            return {"ok": False, "error": "请选择项目内有效的音频文件"}
        _persist_narrator_voice_content(
            username=ctx.owner_username,
            project=ctx.project_name,
            project_dir=ctx.output_dir,
            filename=source_path.name,
            content=source_path.read_bytes(),
        )
    except (ValueError, OSError) as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "data": _narrator_voice_payload(ctx, store),
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
        _trim_narrator_voice_content(
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
    target = Path(stored.get("path", ""))
    if str(target):
        if not target.is_absolute():
            target = ctx.output_dir / target
        if target.exists():
            target.replace(
                target.with_name(f"{target.stem}_{int(time.time())}{target.suffix}")
            )
    set_narrator_reference_audio(
        ctx.owner_username, ctx.project_name, relative_path="", sha256=""
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
