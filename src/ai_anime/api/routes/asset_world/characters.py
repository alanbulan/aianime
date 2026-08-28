"""角色列表 & 肖像/身份图生成端点。"""

import logging
from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import JSONResponse

logger = logging.getLogger("ai_anime.api.characters")

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import (
    make_sqlite_store,
    make_sqlite_store_for_context,
    make_static_url_for_context,
    resolve_project_scope,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.story_intake.public import (
    StoryImportRequired,
    story_import_required_response,
)
from ai_anime.api.routes.asset_world.characters_schemas import (
    AssetImageSourceSelectionRequest,
    PortraitGenRequest,
    CharacterCreate,
    CharacterUpdate,
    CharacterImageSelectionRequest,
    CharacterAssetRestoreRequest,
    IdentityCreate,
    IdentityUpdate,
    IdentityImageGenRequest,
)
from ai_anime.api.routes.asset_world.voice_schemas import (
    CharacterVoiceBindRequest,
    CharacterVoiceDesignMissingRequest,
    CharacterVoiceRecordRequest,
    CharacterVoiceTrimRequest,
)
from ai_anime.modules.asset_world.public import (
    CharacterCatalogRejected,
    CharacterGenerationOptions,
    CharacterVoiceRejected,
    CreateCharacterCommand,
    CreateIdentityCommand,
    RestoreCharacterAssetCommand,
    InvalidImageSelection,
    InvalidCharacterVoiceInput,
    UnsupportedImageSourceKind,
    UpdateCharacterCommand,
    UpdateIdentityCommand,
    character_asset_history_use_cases,
    character_catalog_use_cases,
    character_generation_use_cases,
    character_identity_use_cases,
    character_image_use_cases,
    image_settings_use_cases,
    character_task_use_cases,
    character_voice_use_cases,
    is_supported_voice_sample,
)
from ai_anime.shared.project_media import make_project_asset_url_builder
from ai_anime.sqlite_store import SQLiteStore

router = APIRouter()


def _invalid_image_selection_response(exc: InvalidImageSelection) -> JSONResponse:
    content: dict[str, object] = {"ok": False, "error": str(exc)}
    code = str(getattr(exc, "code", "") or "").strip()
    if code:
        content["code"] = code
    if bool(getattr(exc, "action_required", False)):
        content["action_required"] = True
    return JSONResponse(status_code=400, content=content)


async def _resolve_character_project(
    project: str,
    user: dict,
    *,
    required_role: str = "editor",
) -> tuple[ProjectContext | None, str, str, Path, str, SQLiteStore]:
    resolved = await resolve_project_scope(project, user, required_role=required_role)
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    return (
        resolved.ctx,
        resolved.username,
        resolved.project_name,
        resolved.project_dir,
        resolved.output_dir,
        store,
    )


def _character_voice_media_url(
    ctx: ProjectContext,
    project_dir: Path,
) -> Callable[[str], str]:
    asset_url = make_project_asset_url_builder(
        ctx,
        project_dir,
        make_static_url_for_context,
    )
    return lambda rel_path: asset_url(project_dir / rel_path)


def _resolve_reusable_voice(ctx: ProjectContext, voice_id: str) -> Path:
    from ai_anime.modules.creative_canvas.public import (
        CreativeCanvasAudioVoiceMissing,
        GetCreativeCanvasAudioVoiceQuery,
        creative_canvas_audio_library_use_cases,
    )

    try:
        return creative_canvas_audio_library_use_cases().get_voice(
            GetCreativeCanvasAudioVoiceQuery(
                context=ctx,
                voice_id=voice_id.strip(),
            )
        )
    except CreativeCanvasAudioVoiceMissing as exc:
        raise InvalidCharacterVoiceInput("所选声线不存在或无权访问") from exc


_CHARACTER_VOICE_SLOT_LABELS = {
    "default": "默认",
    "child": "幼年",
    "youth": "青年",
    "middle": "中年",
    "elder": "老年",
}


def _create_reusable_character_voice(
    *,
    ctx: ProjectContext,
    character_name: str,
    slot: str,
    filename: str,
    content: bytes,
    mime_type: str,
) -> tuple[dict, Path]:
    from ai_anime.modules.creative_canvas.public import (
        CreateCreativeCanvasAudioVoiceCommand,
        InvalidCreativeCanvasAudioLibraryRequest,
        creative_canvas_audio_library_use_cases,
    )

    slot_label = _CHARACTER_VOICE_SLOT_LABELS.get(slot, slot)
    try:
        created = dict(
            creative_canvas_audio_library_use_cases().create_voice(
                CreateCreativeCanvasAudioVoiceCommand(
                    context=ctx,
                    name=f"{character_name} · {slot_label}声线",
                    filename=filename,
                    content=content,
                    mime_type=mime_type,
                )
            )
        )
    except InvalidCreativeCanvasAudioLibraryRequest as exc:
        raise InvalidCharacterVoiceInput(str(exc)) from exc
    voice_id = str(created.get("voice_id") or "")
    return created, _resolve_reusable_voice(ctx, voice_id)


@router.get("/projects/{project}/characters")
async def list_characters(
    project: str,
    user: dict = Depends(get_api_user),
):
    """获取项目角色列表。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )

    asset_project = getattr(ctx, "project_id", "") or project
    data = await character_catalog_use_cases().list_characters(
        repository=store,
        project_dir=project_dir,
        asset_project=asset_project,
        asset_url=make_project_asset_url_builder(
            ctx, project_dir, make_static_url_for_context
        ),
    )

    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters")
async def add_character(
    project: str,
    body: CharacterCreate,
    user: dict = Depends(get_api_user),
):
    """手动添加单个角色（当自动提取失败时使用）。"""
    logger.info("[%s] add_character: %s (main=%s)", project, body.name, body.is_main)
    _ctx, _username, _project_name, _project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )

    try:
        data = await character_catalog_use_cases().create_character(
            repository=store,
            command=CreateCharacterCommand(**body.model_dump()),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/build")
async def build_characters(project: str, user: dict = Depends(get_api_user)):
    """从知识图谱补充缺失角色。"""
    logger.info("[%s] build_characters", project)
    resolved = await resolve_project_scope(project, user, required_role="editor")
    ctx = resolved.ctx
    output_dir = resolved.output_dir
    try:
        scheduled = await character_task_use_cases().schedule_build_characters(
            task_context=ctx,
            output_dir=output_dir,
        )
    except StoryImportRequired:
        return story_import_required_response()
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.get("/projects/{project}/character-image-selection")
async def get_project_character_image_selection(
    project: str,
    user: dict = Depends(get_api_user),
):
    """获取项目级角色/身份图生成源选择。"""
    _ctx, username, project_name, _project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )
    data = image_settings_use_cases().get_character_selection(
        username,
        project_name,
    )
    return {"ok": True, "data": data}


@router.patch("/projects/{project}/character-image-selection")
async def update_project_character_image_selection(
    project: str,
    body: CharacterImageSelectionRequest,
    user: dict = Depends(get_api_user),
):
    """保存项目级角色/身份图生成源选择。"""
    _ctx, username, project_name, _project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = image_settings_use_cases().update_character_selection(
            username,
            project_name,
            body.character_image_selection,
        )
    except InvalidImageSelection as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    return {"ok": True, "data": data}


@router.get("/projects/{project}/image-source-selection/{asset_kind}")
async def get_project_asset_image_source_selection(
    project: str,
    asset_kind: str,
    user: dict = Depends(get_api_user),
):
    """获取项目级素材图源选择。"""
    use_cases = image_settings_use_cases()
    try:
        normalized_kind = use_cases.normalize_asset_kind(asset_kind)
    except UnsupportedImageSourceKind as exc:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": str(exc)},
        )
    _ctx, username, project_name, _project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )
    return {
        "ok": True,
        "data": use_cases.get_asset_selection(
            username,
            project_name,
            normalized_kind,
        ),
    }


@router.patch("/projects/{project}/image-source-selection/{asset_kind}")
async def update_project_asset_image_source_selection(
    project: str,
    asset_kind: str,
    body: AssetImageSourceSelectionRequest,
    user: dict = Depends(get_api_user),
):
    """保存项目级素材图源选择。"""
    use_cases = image_settings_use_cases()
    try:
        normalized_kind = use_cases.normalize_asset_kind(asset_kind)
    except UnsupportedImageSourceKind as exc:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": str(exc)},
        )
    _ctx, username, project_name, _project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = use_cases.update_asset_selection(
            username,
            project_name,
            normalized_kind,
            body.image_source_selection,
        )
    except InvalidImageSelection as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    return {"ok": True, "data": data}


@router.get("/projects/{project}/character-image-usage")
async def get_project_character_image_usage(
    project: str,
    user: dict = Depends(get_api_user),
):
    """获取角色/身份图请求用量统计。"""
    _ctx, _username, _project_name, project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )
    summary = image_settings_use_cases().get_character_usage(project_dir)
    return {"ok": True, "data": summary}


@router.get("/projects/{project}/characters/{name}/identities")
async def get_character_identities(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    """获取角色全部身份及图片。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )

    asset_project = getattr(ctx, "project_id", "") or project
    try:
        data = character_identity_use_cases().list_identities(
            repository=store,
            character_name=name,
            project_dir=project_dir,
            asset_project=asset_project,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.get("/projects/{project}/characters/{name}/asset-history")
async def list_character_asset_history(
    project: str,
    name: str,
    kind: str,
    identity_id: str = "",
    user: dict = Depends(get_api_user),
):
    """列出角色资产的历史备份，用于 UI 回看和恢复。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )
    try:
        data = character_asset_history_use_cases().list_history(
            repository=store,
            character_name=name,
            project_dir=project_dir,
            kind=kind,
            identity_id=identity_id,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/asset-history/restore")
async def restore_character_asset_history(
    project: str,
    name: str,
    body: CharacterAssetRestoreRequest,
    user: dict = Depends(get_api_user),
):
    """把某个历史备份恢复到角色资产 canonical 槽位。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    kind = str(getattr(body, "kind", "") or "").strip()
    identity_id = str(getattr(body, "identity_id", "") or "").strip()
    history_id = str(getattr(body, "history_id", "") or "").strip()
    try:
        data = await character_asset_history_use_cases().restore_history(
            repository=store,
            character_name=name,
            project_dir=project_dir,
            command=RestoreCharacterAssetCommand(
                kind=kind,
                identity_id=identity_id,
                history_id=history_id,
            ),
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.patch("/projects/{project}/characters/{name}")
async def update_character(
    project: str,
    name: str,
    body: CharacterUpdate,
    user: dict = Depends(get_api_user),
):
    """编辑角色基本信息。"""
    _ctx, _username, _project_name, _project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )

    try:
        data = await character_catalog_use_cases().update_character(
            repository=store,
            character_name=name,
            command=UpdateCharacterCommand(
                fields=body.model_dump(exclude_none=True)
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/delete")
async def delete_character(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    """删除角色。POST 保持与 React active UI 的兼容契约。"""
    _ctx, _username, _project_name, _project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = await character_catalog_use_cases().delete_character(
            repository=store,
            character_name=name,
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.get("/projects/{project}/characters/{name}/voice-samples")
async def list_character_voice_samples(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    """获取角色 IndexTTS2 声线样本插槽。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )
    try:
        data = character_voice_use_cases().list_samples(
            repository=store,
            character_name=name,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
    except CharacterVoiceRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/voices/design-missing")
async def design_missing_character_voices(
    project: str,
    body: CharacterVoiceDesignMissingRequest,
    user: dict = Depends(get_api_user),
):
    """生成缺失角色声线，或按明确角色范围覆盖重做已有声线。"""
    from ai_anime.modules.production.public import (
        VoiceDesignModelUnavailable,
        VoiceDesignProvisioningFailed,
        provision_missing_character_voices,
    )

    ctx, _username, _project_name, _project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    characters = list(store.get_all_characters())
    preview_text_by_character: dict[str, str] = {}
    project_preview_text = ""
    for episode in store.get_all_episodes():
        episode_num = int(getattr(episode, "number", 0) or 0)
        if episode_num <= 0:
            continue
        for beat in await store.get_beats_as_dicts(episode_num):
            preview_text = str(
                beat.get("dialogue")
                or beat.get("narration_segment")
                or beat.get("narration")
                or ""
            ).strip()
            if not preview_text:
                continue
            project_preview_text = project_preview_text or preview_text
            speaker = str(beat.get("speaker") or "").strip()
            if not speaker:
                continue
            for character in characters:
                character_name = str(getattr(character, "name", "") or "").strip()
                aliases = {
                    str(alias or "").strip()
                    for alias in (getattr(character, "aliases", None) or [])
                }
                if (
                    speaker == character_name
                    or speaker.startswith(f"{character_name}_")
                    or speaker.split("_", 1)[0] in aliases
                ):
                    preview_text_by_character.setdefault(character_name, preview_text)
                    break
    try:
        completed, skipped = await provision_missing_character_voices(
            ctx,
            characters,
            character_names=body.character_names,
            replace_existing=body.replace_existing,
            preview_text_by_character=preview_text_by_character,
            project_preview_text=project_preview_text,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    except VoiceDesignModelUnavailable as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "code": exc.code, "error": str(exc)},
        )
    except VoiceDesignProvisioningFailed as exc:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": exc.code, "error": str(exc)},
        )
    return {
        "ok": True,
        "data": {
            "generated": list(completed),
            "skipped_existing": list(skipped),
        },
        "agent_instruction": (
            "向用户准确报告 generated 与 skipped_existing；本接口只生成并绑定声线。"
            + (
                "本次已按明确角色范围覆盖重做已有声线；旧音频文件会保留为时间戳备份；"
                if body.replace_existing
                else "本次只替换缺失、不可读或不符合 1.8-15 秒约束的样本，保留合规声线；"
            )
            + "不会启动完整生产流程或整集配音。"
        ),
    }


@router.post("/projects/{project}/characters/{name}/voice-samples/{slot}/upload")
async def upload_character_voice_sample(
    project: str,
    name: str,
    slot: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """上传角色 IndexTTS2 声线样本。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        filename = file.filename or "voice.wav"
        if not is_supported_voice_sample(filename):
            raise InvalidCharacterVoiceInput("仅支持 mp3 / wav / m4a / aac / ogg")
        content = await file.read()
        created_voice, source_path = _create_reusable_character_voice(
            ctx=ctx,
            character_name=name,
            slot=slot,
            filename=filename,
            content=content,
            mime_type=file.content_type or "application/octet-stream",
        )
        data = await character_voice_use_cases().bind_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            slot=slot,
            source_path=source_path,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
        data["voice_library_id"] = str(created_voice.get("voice_id") or "")
    except CharacterVoiceRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/voice-samples/{slot}/bind")
async def bind_character_voice_sample(
    project: str,
    name: str,
    slot: str,
    body: CharacterVoiceBindRequest,
    user: dict = Depends(get_api_user),
):
    """将账号声线库中的声线绑定到角色默认/年龄段插槽。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        source_path = _resolve_reusable_voice(ctx, body.voice_id)
        data = await character_voice_use_cases().bind_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            slot=slot,
            source_path=source_path,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
    except CharacterVoiceRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/voice-samples/{slot}/record")
async def record_character_voice_sample(
    project: str,
    name: str,
    slot: str,
    body: CharacterVoiceRecordRequest,
    user: dict = Depends(get_api_user),
):
    """保存浏览器录音为角色 IndexTTS2 声线样本。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        voice_use_cases = character_voice_use_cases()
        content, extension = voice_use_cases.decode_recording(body.data_url)
        created_voice, source_path = _create_reusable_character_voice(
            ctx=ctx,
            character_name=name,
            slot=slot,
            filename=f"recorded{extension}",
            content=content,
            mime_type=("audio/mpeg" if extension == ".mp3" else "audio/wav"),
        )
        data = await voice_use_cases.bind_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            slot=slot,
            source_path=source_path,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
        data["voice_library_id"] = str(created_voice.get("voice_id") or "")
    except CharacterVoiceRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/voice-samples/{slot}/trim")
async def trim_character_voice_sample(
    project: str,
    name: str,
    slot: str,
    body: CharacterVoiceTrimRequest,
    user: dict = Depends(get_api_user),
):
    """裁剪角色 IndexTTS2 声线样本并写回同一插槽。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = await character_voice_use_cases().trim_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            slot=slot,
            source_path=body.source_path,
            start_seconds=body.start_seconds,
            duration_seconds=body.duration_seconds,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
    except CharacterVoiceRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/voice-samples/{slot}/delete")
async def delete_character_voice_sample(
    project: str,
    name: str,
    slot: str,
    user: dict = Depends(get_api_user),
):
    """清除角色 IndexTTS2 声线样本。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = await character_voice_use_cases().delete_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            slot=slot,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
    except CharacterVoiceRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/characters/{name}/identities/{identity_id}/voice/bind"
)
async def bind_identity_voice_sample(
    project: str,
    name: str,
    identity_id: str,
    body: CharacterVoiceBindRequest,
    user: dict = Depends(get_api_user),
):
    """为具体身份绑定账号声线库中的专属声线。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        source_path = _resolve_reusable_voice(ctx, body.voice_id)
        data = await character_voice_use_cases().bind_identity_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            source_path=source_path,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
    except CharacterVoiceRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/characters/{name}/identities/{identity_id}/voice/delete"
)
async def delete_identity_voice_sample(
    project: str,
    name: str,
    identity_id: str,
    user: dict = Depends(get_api_user),
):
    """清除身份专属声线，恢复年龄段/角色默认继承。"""
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = await character_voice_use_cases().delete_identity_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
    except CharacterVoiceRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/identities")
async def add_identity(
    project: str,
    name: str,
    body: IdentityCreate,
    user: dict = Depends(get_api_user),
):
    """为角色新增一个身份。"""
    _ctx, _username, _project_name, _project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )

    try:
        data = await character_identity_use_cases().create_identity(
            repository=store,
            character_name=name,
            command=CreateIdentityCommand(**body.model_dump()),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.patch("/projects/{project}/characters/{name}/identities/{identity_id}")
async def update_identity(
    project: str,
    name: str,
    identity_id: str,
    body: IdentityUpdate,
    user: dict = Depends(get_api_user),
):
    """编辑角色身份属性。"""
    _ctx, _username, _project_name, _project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )

    try:
        data = await character_identity_use_cases().update_identity(
            repository=store,
            character_name=name,
            identity_id=identity_id,
            command=UpdateIdentityCommand(
                fields=body.model_dump(exclude_none=True)
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.delete("/projects/{project}/characters/{name}/identities/{identity_id}")
async def delete_identity(
    project: str,
    name: str,
    identity_id: str,
    user: dict = Depends(get_api_user),
):
    """删除角色身份。"""
    _ctx, _username, _project_name, _project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )

    try:
        data = await character_identity_use_cases().delete_identity(
            repository=store,
            character_name=name,
            identity_id=identity_id,
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/portrait-async")
async def generate_single_portrait_async(
    project: str,
    name: str,
    body: PortraitGenRequest = PortraitGenRequest(),
    user: dict = Depends(get_api_user),
):
    """启动单角色 Portrait 后台任务。"""
    ctx, username, project_name, project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user)
    )

    try:
        options = image_settings_use_cases().character_generation_options(
            username,
            project_name,
            requested_style=body.style,
            requested_model=body.model,
        )
        scheduled = await character_task_use_cases().schedule_character_portrait(
            task_context=ctx,
            project_dir=project_dir,
            character_name=name,
            style=options.style,
            model=options.model,
            model_selector=options.model_selector,
        )
    except InvalidImageSelection as exc:
        return _invalid_image_selection_response(exc)
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/characters/{name}/portrait")
async def generate_single_portrait(
    project: str,
    name: str,
    body: PortraitGenRequest,
    user: dict = Depends(get_api_user),
):
    """为单个角色生成肖像（face close-up）。"""
    logger.info("[%s] generate_single_portrait: %s, model=%s", project, name, body.model)
    ctx, username, project_name, project_dir, output_dir, store = await _resolve_character_project(
        project, user
    )

    settings = image_settings_use_cases()

    def generation_options() -> CharacterGenerationOptions:
        return settings.character_generation_options(
            username,
            project_name,
            requested_style=body.style,
            requested_model=body.model,
            requested_ethnicity=body.ethnicity,
        )

    try:
        data = await character_generation_use_cases().generate_character_portrait(
            repository=store,
            project_dir=project_dir,
            output_dir=output_dir,
            character_name=name,
            options=generation_options,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except InvalidImageSelection as exc:
        return _invalid_image_selection_response(exc)
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/portrait/upload")
async def upload_portrait(
    project: str,
    name: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """上传角色肖像图片。"""
    logger.info("[%s] upload_portrait: %s", project, name)
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )

    try:
        data = await character_image_use_cases().upload_character_portrait(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            upload=file,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/identities/{identity_name}/upload")
async def upload_identity_image(
    project: str,
    name: str,
    identity_name: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """上传角色身份图片。"""
    logger.info("[%s] upload_identity_image: %s/%s", project, name, identity_name)
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )

    try:
        data = await character_image_use_cases().upload_identity_image(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_name=identity_name,
            upload=file,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/identities/{identity_id}/image/delete")
async def delete_identity_image(
    project: str,
    name: str,
    identity_id: str,
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    data = await character_image_use_cases().delete_identity_image(
        repository=store,
        project_dir=project_dir,
        character_name=name,
        identity_id=identity_id,
    )
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/identities/{identity_id}/costume/upload")
async def upload_identity_costume(
    project: str,
    name: str,
    identity_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = await character_image_use_cases().upload_identity_costume(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            upload=file,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/identities/{identity_id}/costume/delete")
async def delete_identity_costume(
    project: str,
    name: str,
    identity_id: str,
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = await character_image_use_cases().delete_identity_costume(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/identities/{identity_id}/portrait/upload")
async def upload_identity_portrait(
    project: str,
    name: str,
    identity_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        data = await character_image_use_cases().upload_identity_portrait(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            upload=file,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/characters/{name}/identities/{identity_id}/portrait/generate-async"
)
async def generate_identity_portrait_async(
    project: str,
    name: str,
    identity_id: str,
    body: IdentityImageGenRequest = IdentityImageGenRequest(),
    user: dict = Depends(get_api_user),
):
    ctx, username, project_name, project_dir, _output_dir, store = await _resolve_character_project(
        project, user
    )
    try:
        options = image_settings_use_cases().character_generation_options(
            username,
            project_name,
            requested_style=body.style,
            requested_model=body.model,
        )
        scheduled = await character_task_use_cases().schedule_identity_portrait(
            repository=store,
            task_context=ctx,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            style=options.style,
            model=options.model,
            model_selector=options.model_selector,
        )
    except InvalidImageSelection as exc:
        return _invalid_image_selection_response(exc)
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/characters/{name}/identities/{identity_id}/portrait/generate")
async def generate_identity_portrait(
    project: str,
    name: str,
    identity_id: str,
    body: IdentityImageGenRequest = IdentityImageGenRequest(),
    user: dict = Depends(get_api_user),
):
    """同步生成身份级 portrait，供旧调用保留。新 UI 应优先使用 async。"""
    ctx, username, project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    settings = image_settings_use_cases()

    def generation_options() -> CharacterGenerationOptions:
        return settings.character_generation_options(
            username,
            project_name,
            requested_style=body.style,
            requested_model=body.model,
        )

    try:
        data = await character_generation_use_cases().generate_identity_portrait(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            options=generation_options,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except InvalidImageSelection as exc:
        return _invalid_image_selection_response(exc)
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/identities/{identity_id}/generate-async")
async def generate_identity_image_async(
    project: str,
    name: str,
    identity_id: str,
    body: IdentityImageGenRequest = IdentityImageGenRequest(),
    user: dict = Depends(get_api_user),
):
    ctx, username, project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user)
    )
    try:
        options = image_settings_use_cases().character_generation_options(
            username,
            project_name,
            requested_style=body.style,
            requested_model=body.model,
            fallback_role="IMAGE_EDIT",
        )
        scheduled = await character_task_use_cases().schedule_identity_image(
            repository=store,
            task_context=ctx,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            style=options.style,
            model=options.model,
            model_selector=options.model_selector,
        )
    except InvalidImageSelection as exc:
        return _invalid_image_selection_response(exc)
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.get("/projects/{project}/characters/{name}/identities/{identity_id}/attempts")
async def get_identity_attempts(
    project: str,
    name: str,
    identity_id: str,
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )
    try:
        data = character_image_use_cases().identity_attempts(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
        )
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/characters/{name}/identities/{identity_id}/generate")
async def generate_identity_image(
    project: str,
    name: str,
    identity_id: str,
    body: IdentityImageGenRequest = IdentityImageGenRequest(),
    user: dict = Depends(get_api_user),
):
    """基于角色肖像生成身份参考图（Identity Locking）。"""
    logger.info(
        "[%s] generate_identity_image: %s/%s, model=%s", project, name, identity_id, body.model
    )
    ctx, username, project_name, project_dir, _output_dir, store = await _resolve_character_project(
        project, user
    )

    settings = image_settings_use_cases()

    def generation_options() -> CharacterGenerationOptions:
        return settings.character_generation_options(
            username,
            project_name,
            requested_style=body.style,
            requested_model=body.model,
            fallback_role="IMAGE_EDIT",
        )

    try:
        data = await character_generation_use_cases().generate_identity_image(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            options=generation_options,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except InvalidImageSelection as exc:
        return _invalid_image_selection_response(exc)
    except CharacterCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}
