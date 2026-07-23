"""角色列表 & 肖像/身份图生成端点。"""

import logging
import re
import shutil
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import JSONResponse

logger = logging.getLogger("ai_anime.api.characters")

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import (
    make_sqlite_store,
    make_sqlite_store_for_context,
    make_static_url_for_context,
    resolve_project_scope,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.api.schemas import (
    AssetImageSourceSelectionRequest,
    PortraitGenRequest,
    CharacterCreate,
    CharacterUpdate,
    CharacterImageSelectionRequest,
    CharacterAssetRestoreRequest,
    IdentityCreate,
    IdentityUpdate,
    IdentityImageGenRequest,
    CharacterVoiceRecordRequest,
    CharacterVoiceTrimRequest,
)
from ai_anime.config import (
    image_generation_selection_options,
    character_image_selection_options,
    get_character_image_selection,
    normalize_image_generation_selection,
    normalize_character_image_selection,
)
from ai_anime.image_request_usage import get_image_usage_summary
from ai_anime.project_config import (
    load_project_config,
    load_project_config_file,
    update_project_config_file,
)
from ai_anime.utils.path_resolver import (
    compute_portrait_path,
    compute_identity_costume_path,
    compute_identity_portrait_path,
)
from ai_anime.modules.asset_world.public import (
    CharacterCatalogRejected,
    CharacterVoiceRejected,
    CreateCharacterCommand,
    CreateIdentityCommand,
    RestoreCharacterAssetCommand,
    UpdateCharacterCommand,
    UpdateIdentityCommand,
    character_asset_history_use_cases,
    character_catalog_use_cases,
    character_identity_use_cases,
    character_image_use_cases,
    character_task_use_cases,
    character_voice_use_cases,
    find_character_identity,
    safe_character_asset_name,
)
from ai_anime.sqlite_store import SQLiteStore

router = APIRouter()

CHARACTER_IMAGE_SELECTION_CONFIG_KEY = "character_image_selection"
ASSET_IMAGE_SELECTION_CONFIG_KEYS = {
    "character": CHARACTER_IMAGE_SELECTION_CONFIG_KEY,
    "scene": "scene_image_selection",
    "prop": "prop_image_selection",
}
CHARACTER_IMAGE_USAGE_TASK_TYPES = ("character_portrait", "identity_image")


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


def _character_image_selection_payload(username: str, project: str) -> dict:
    options = character_image_selection_options()
    config = load_project_config_file(username, project)
    saved_selection = str(config.get(CHARACTER_IMAGE_SELECTION_CONFIG_KEY) or "").strip()
    if saved_selection in options:
        selection = saved_selection
    else:
        selection = normalize_character_image_selection(saved_selection)
        if selection not in options:
            selection = get_character_image_selection()
    return {"character_image_selection": selection, "options": options}


def _asset_image_source_selection_payload(username: str, project: str, asset_kind: str) -> dict:
    options = image_generation_selection_options()
    config_key = ASSET_IMAGE_SELECTION_CONFIG_KEYS[asset_kind]
    if asset_kind == "character":
        selection = _character_image_selection_payload(username, project)["character_image_selection"]
    else:
        saved_selection = str(load_project_config_file(username, project).get(config_key) or "")
        selection = normalize_image_generation_selection(saved_selection)
    return {
        "asset_kind": asset_kind,
        "image_source_selection": selection,
        "options": options,
    }


def _validate_asset_image_source_kind(asset_kind: str) -> str | None:
    normalized = str(asset_kind or "").strip().lower()
    if normalized in ASSET_IMAGE_SELECTION_CONFIG_KEYS:
        return normalized
    return None


def _resolve_character_image_model(username: str, project: str, requested_model: str | None) -> str:
    model = str(requested_model or "").strip()
    if model:
        return model
    return _character_image_selection_payload(username, project)["character_image_selection"]


def _asset_url(ctx: ProjectContext, project_dir: Path, abs_path: str | Path) -> str:
    path = Path(abs_path)
    if not path.exists():
        return ""
    try:
        rel_path = path.relative_to(project_dir).as_posix()
    except ValueError:
        return ""
    return make_static_url_for_context(ctx, rel_path, local_path=path)


def _character_voice_media_url(
    ctx: ProjectContext,
    project_dir: Path,
) -> Callable[[str], str]:
    return lambda rel_path: _asset_url(ctx, project_dir, project_dir / rel_path)


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
        asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
    return {"ok": True, "data": _character_image_selection_payload(username, project_name)}


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
    selection = str(body.character_image_selection or "").strip()
    options = character_image_selection_options()
    if selection not in options:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": f"Invalid character_image_selection: {selection}",
            },
        )

    def _apply(config: dict) -> None:
        config[CHARACTER_IMAGE_SELECTION_CONFIG_KEY] = selection

    update_project_config_file(username, project_name, _apply)
    return {"ok": True, "data": _character_image_selection_payload(username, project_name)}


@router.get("/projects/{project}/image-source-selection/{asset_kind}")
async def get_project_asset_image_source_selection(
    project: str,
    asset_kind: str,
    user: dict = Depends(get_api_user),
):
    """获取项目级素材图源选择。"""
    normalized_kind = _validate_asset_image_source_kind(asset_kind)
    if normalized_kind is None:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": f"Unsupported image source kind: {asset_kind}"},
        )
    _ctx, username, project_name, _project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )
    return {
        "ok": True,
        "data": _asset_image_source_selection_payload(username, project_name, normalized_kind),
    }


@router.patch("/projects/{project}/image-source-selection/{asset_kind}")
async def update_project_asset_image_source_selection(
    project: str,
    asset_kind: str,
    body: AssetImageSourceSelectionRequest,
    user: dict = Depends(get_api_user),
):
    """保存项目级素材图源选择。"""
    normalized_kind = _validate_asset_image_source_kind(asset_kind)
    if normalized_kind is None:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": f"Unsupported image source kind: {asset_kind}"},
        )
    _ctx, username, project_name, _project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user)
    )
    selection = str(body.image_source_selection or "").strip()
    options = image_generation_selection_options()
    if selection not in options:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": f"Invalid image_source_selection: {selection}"},
        )
    config_key = ASSET_IMAGE_SELECTION_CONFIG_KEYS[normalized_kind]

    def _apply(config: dict) -> None:
        config[config_key] = selection

    update_project_config_file(username, project_name, _apply)
    return {
        "ok": True,
        "data": _asset_image_source_selection_payload(username, project_name, normalized_kind),
    }


@router.get("/projects/{project}/character-image-usage")
async def get_project_character_image_usage(
    project: str,
    user: dict = Depends(get_api_user),
):
    """获取角色/身份图请求用量统计。"""
    _ctx, _username, _project_name, project_dir, _output_dir, _store = (
        await _resolve_character_project(project, user, required_role="viewer")
    )
    summary = get_image_usage_summary(
        project_output_dir=project_dir,
        task_types=CHARACTER_IMAGE_USAGE_TASK_TYPES,
    )
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
        data = await character_voice_use_cases().upload_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            slot=slot,
            upload=file,
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
        data = await character_voice_use_cases().record_sample(
            repository=store,
            project_dir=project_dir,
            character_name=name,
            slot=slot,
            data_url=body.data_url,
            media_url=_character_voice_media_url(ctx, project_dir),
        )
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

    config = load_project_config(username, project_name)
    style = body.style or config.get("visual_style", "chinese_period_drama")
    model = _resolve_character_image_model(username, project_name, body.model)
    try:
        scheduled = await character_task_use_cases().schedule_character_portrait(
            task_context=ctx,
            project_dir=project_dir,
            character_name=name,
            style=style,
            model=model,
        )
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

    character = store.get_character(name)
    if character is None:
        return {"ok": False, "error": f"Character '{name}' not found"}

    proj_config = load_project_config(username, project_name)
    style = body.style or proj_config.get("visual_style", "chinese_period_drama")

    from ai_anime.generators.image_generator import generate_character_reference_unified

    # 备份旧肖像
    portrait_path = compute_portrait_path(project_dir, name)
    if portrait_path and Path(portrait_path).exists():
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        backup = Path(portrait_path).with_name(f"portrait_{ts}.png")
        shutil.copy(portrait_path, backup)

    paths = await generate_character_reference_unified(
        character_name=name,
        appearance_prompt=character.face_prompt if hasattr(character, "face_prompt") else "",
        style=style,
        ethnicity=body.ethnicity,
        model=_resolve_character_image_model(username, project_name, body.model),
        output_dir=output_dir,
        project_dir=str(project_dir),
    )

    if not paths:
        return {"ok": False, "error": "Portrait generation failed"}

    # 复制为标准肖像路径
    char_dir = project_dir / "assets" / "characters" / name
    char_dir.mkdir(parents=True, exist_ok=True)
    final_path = char_dir / "portrait.png"
    shutil.copy(paths[0], final_path)

    portrait_url = _asset_url(ctx, project_dir, final_path)

    return {"ok": True, "data": {"portrait_url": portrait_url}}


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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
    config = load_project_config(username, project_name)
    style = body.style or config.get("visual_style", "chinese_period_drama")
    model = _resolve_character_image_model(username, project_name, body.model)
    try:
        scheduled = await character_task_use_cases().schedule_identity_portrait(
            repository=store,
            task_context=ctx,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            style=style,
            model=model,
        )
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
    character = store.get_character(name)
    if character is None:
        return {"ok": False, "error": f"Character '{name}' not found"}
    identity = find_character_identity(character, identity_id)
    if identity is None:
        return {"ok": False, "error": f"Identity '{identity_id}' not found"}
    if not getattr(identity, "face_prompt", ""):
        return {"ok": False, "error": "该身份无 face_prompt，无需独立 Portrait"}

    from ai_anime.generators import generate_character_reference_unified

    config = load_project_config(username, project_name)
    safe_name = safe_character_asset_name(identity.identity_name)
    identities_dir = project_dir / "assets" / "characters" / name / "identities"
    identities_dir.mkdir(parents=True, exist_ok=True)
    target = identities_dir / f"{name}_{safe_name}_portrait.png"
    tmp_dir = identities_dir / f".tmp_identity_portrait_{datetime.now():%Y%m%d%H%M%S%f}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        paths = await generate_character_reference_unified(
            character_name=name,
            appearance_prompt=str(identity.face_prompt).strip(),
            output_dir=str(tmp_dir),
            count=1,
            use_mock=False,
            style=body.style or config.get("visual_style", "chinese_period_drama"),
            ethnicity=config.get("ethnicity", "Chinese"),
            model=_resolve_character_image_model(username, project_name, body.model),
            project_dir=str(project_dir),
            usage_task_type="character_portrait",
            usage_scope=f"character:{name}:identity_portrait:{identity.identity_name}",
            identity_name=identity.identity_name,
        )
        if not paths:
            return {"ok": False, "error": "身份 Portrait 生成失败"}
        if target.exists():
            backup = (
                identities_dir / f"{name}_{safe_name}_portrait_{datetime.now():%Y%m%d%H%M%S}.png"
            )
            shutil.copy(target, backup)
        shutil.copy(paths[0], target)
        await store.update_character_identity(name, identity_id, portrait_image=str(target))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return {
        "ok": True,
        "data": {"portrait_image_url": _asset_url(ctx, project_dir, target)},
    }


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
    config = load_project_config(username, project_name)
    style = body.style or config.get("visual_style", "chinese_period_drama")
    model = _resolve_character_image_model(username, project_name, body.model)
    try:
        scheduled = await character_task_use_cases().schedule_identity_image(
            repository=store,
            task_context=ctx,
            project_dir=project_dir,
            character_name=name,
            identity_id=identity_id,
            style=style,
            model=model,
        )
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
    character = store.get_character(name)
    if character is None:
        return {"ok": False, "error": f"Character '{name}' not found"}
    identity = find_character_identity(character, identity_id)
    if identity is None:
        return {"ok": False, "error": f"Identity '{identity_id}' not found"}
    safe_name = safe_character_asset_name(identity.identity_name)
    identities_dir = project_dir / "assets" / "characters" / name / "identities"
    image_attempts = len(
        [
            p
            for p in identities_dir.glob(f"{safe_name}*.png")
            if not p.name.endswith("_costume.png") and "_portrait" not in p.stem
        ]
    )
    portrait_attempts = len(list(identities_dir.glob(f"*{safe_name}_portrait*.png")))
    return {
        "ok": True,
        "data": {
            "image_attempts": image_attempts,
            "portrait_attempts": portrait_attempts,
        },
    }


@router.post("/projects/{project}/characters/{name}/identities/{identity_id}/generate")
async def generate_identity_image(
    project: str,
    name: str,
    identity_id: str,
    body: IdentityImageGenRequest = IdentityImageGenRequest(),
    user: dict = Depends(get_api_user),
):
    """基于角色肖像生成身份参考图（Identity Locking）。"""
    from ai_anime.generators.image_generator import generate_identity_image_unified

    logger.info(
        "[%s] generate_identity_image: %s/%s, model=%s", project, name, identity_id, body.model
    )
    ctx, username, project_name, project_dir, _output_dir, store = await _resolve_character_project(
        project, user
    )

    character = store.get_character(name)
    if character is None:
        return {"ok": False, "error": f"Character '{name}' not found"}

    # 查找身份
    identity = None
    for id_ in character.identities or []:
        if id_.identity_id == identity_id:
            identity = id_
            break
    if identity is None:
        return {"ok": False, "error": f"Identity '{identity_id}' not found"}

    costume_image = compute_identity_costume_path(project_dir, name, identity.identity_name) or (
        getattr(identity, "costume_image", "") or ""
    )
    identity_portrait = compute_identity_portrait_path(
        project_dir, name, identity.identity_name
    ) or (getattr(identity, "portrait_image", "") or "")
    identity_age = getattr(identity, "age_group", "") or ""
    char_age = getattr(character, "age_group", "youth") or "youth"
    is_age_variant = bool(identity_age and identity_age != char_age)
    has_costume_image = bool(costume_image and Path(costume_image).exists())
    has_identity_portrait = bool(identity_portrait and Path(identity_portrait).exists())
    if (
        not identity.appearance_details
        and not getattr(identity, "face_prompt", "")
        and not has_costume_image
    ):
        return {
            "ok": False,
            "error": "Identity has no appearance_details, face_prompt, or costume_image",
        }

    # 输出路径
    identities_dir = project_dir / "assets" / "characters" / name / "identities"
    identities_dir.mkdir(parents=True, exist_ok=True)
    safe_identity_name = re.sub(r'[/\\:*?"<>|]', "_", identity.identity_name)
    output_path = identities_dir / f"{safe_identity_name}.png"

    # 备份旧文件
    if output_path.exists():
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        backup = identities_dir / f"{safe_identity_name}_{ts}.png"
        shutil.copy(output_path, backup)

    # 读取项目配置获取默认 style/ethnicity
    proj_config = load_project_config(username, project_name)

    face_override = getattr(identity, "face_prompt", "") or ""
    identity_scope = f"character:{name}:identity:{identity.identity_name}"
    if is_age_variant:
        combined_prompt = (
            ""
            if has_identity_portrait and has_costume_image
            else (
                identity.appearance_details
                if has_identity_portrait
                else (
                    face_override
                    if has_costume_image
                    else (
                        f"{face_override}\n{identity.appearance_details}"
                        if identity.appearance_details
                        else face_override
                    )
                )
            )
        )
        result = await generate_identity_image_unified(
            character_name=name,
            identity_prompt=combined_prompt,
            reference_image_path=identity_portrait if has_identity_portrait else "",
            output_path=str(output_path),
            character_tag=getattr(identity, "character_tag", ""),
            ethnicity=proj_config.get("ethnicity", "Chinese"),
            style=body.style or proj_config.get("visual_style"),
            model=_resolve_character_image_model(username, project_name, body.model),
            project_dir=str(project_dir),
            costume_image_path=costume_image if has_costume_image else "",
            usage_task_type="identity_image",
            usage_scope=identity_scope,
            identity_name=identity.identity_name,
        )
    else:
        portrait_path = compute_portrait_path(project_dir, name)
        if not portrait_path or not Path(portrait_path).exists():
            return {
                "ok": False,
                "error": f"Character '{name}' has no portrait. Generate portrait first",
            }

        result = await generate_identity_image_unified(
            character_name=name,
            identity_prompt="" if has_costume_image else identity.appearance_details,
            reference_image_path=str(portrait_path),
            output_path=str(output_path),
            character_tag=getattr(identity, "character_tag", ""),
            ethnicity=proj_config.get("ethnicity", "Chinese"),
            style=body.style or proj_config.get("visual_style"),
            model=_resolve_character_image_model(username, project_name, body.model),
            project_dir=str(project_dir),
            costume_image_path=costume_image if has_costume_image else "",
            usage_task_type="identity_image",
            usage_scope=identity_scope,
            identity_name=identity.identity_name,
        )

    if isinstance(result, bool):
        success = result
        error_msg = "Identity image generation failed"
    else:
        success = result.get("success", False)
        error_msg = result.get("error", "Identity image generation failed")
    if not success:
        return {"ok": False, "error": error_msg}

    image_url = _asset_url(
        ctx,
        project_dir,
        project_dir / "assets" / "characters" / name / "identities" / f"{safe_identity_name}.png",
    )

    return {"ok": True, "data": {"image_url": image_url}}
