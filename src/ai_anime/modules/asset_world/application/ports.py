"""Ports required by Asset & World use cases."""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from pathlib import Path
from typing import Any, BinaryIO, Callable, Mapping, Protocol, Sequence

from ai_anime.modules.asset_world.application.dto import (
    AssetTaskQueueReceipt,
    BatchPropReferenceGenerationTask,
    BuildCharactersTask,
    BuildScenesTask,
    CharacterAssetHistoryEntry,
    CharacterAssetTarget,
    CharacterGenerationOptions,
    CharacterImageGenerationTask,
    CreateCharacterCommand,
    CreateIdentityCommand,
    CreatePropCommand,
    CreateSceneCommand,
    DirectorControlFrameExport,
    IdentityAssetPaths,
    IdentityGenerationAssets,
    ImportedCharacterIdentityAsset,
    PropReferenceGenerationTask,
    SceneReferenceGenerationTask,
    SceneStageGenerationTask,
    StylePreviewGenerationTask,
    SceneViewerAssetState,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class CharacterAssetHistoryRepository(Protocol):
    def get_character(self, name: str) -> Any | None: ...

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates: Any,
    ) -> Any: ...


class CharacterAssetHistoryFiles(Protocol):
    def resolve_target(
        self,
        *,
        project_dir: Path,
        character: Any,
        kind: str,
        identity_id: str,
    ) -> CharacterAssetTarget: ...

    def list_entries(
        self,
        target: Path,
    ) -> list[CharacterAssetHistoryEntry]: ...

    def resolve_source(self, target: Path, history_id: str) -> Path: ...

    def is_file(self, path: Path) -> bool: ...

    def restore(self, source: Path, target: Path) -> Path | None: ...


class CharacterImageRepository(Protocol):
    def get_character(self, name: str) -> Any | None: ...

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates: Any,
    ) -> Any: ...


class CharacterImageUpload(Protocol):
    async def read(self) -> bytes: ...


class CharacterImageFiles(Protocol):
    def save_character_portrait(
        self,
        project_dir: Path,
        character_name: str,
        content: bytes,
    ) -> Path: ...

    def save_identity_image(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        content: bytes,
    ) -> Path: ...

    def delete_identity_image(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> bool: ...

    def save_identity_costume(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        content: bytes,
    ) -> Path: ...

    def delete_identity_costume(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        saved_path: str,
    ) -> bool: ...

    def save_identity_portrait(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        content: bytes,
    ) -> Path: ...

    def count_identity_attempts(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> dict[str, int]: ...


class ProjectImageSelectionStore(Protocol):
    def get(self, username: str, project: str, key: str) -> str: ...

    def set(self, username: str, project: str, key: str, value: str) -> None: ...


class ProjectImageGenerationSettings(Protocol):
    def effective(self, username: str, project: str) -> Mapping[str, Any]: ...

    def stored(self, username: str, project: str) -> Mapping[str, Any]: ...


class ImageUsageReader(Protocol):
    def summary(
        self,
        project_output_dir: str | Path,
        *,
        task_types: tuple[str, ...],
    ) -> dict[str, Any]: ...


class CharacterTaskRepository(Protocol):
    def get_character(self, name: str) -> Any | None: ...


class CharacterTaskScheduler(Protocol):
    async def enqueue_build_characters(
        self,
        task_context: ProjectContext,
        task: BuildCharactersTask,
    ) -> AssetTaskQueueReceipt: ...

    async def enqueue_character_image(
        self,
        task_context: ProjectContext,
        task: CharacterImageGenerationTask,
    ) -> AssetTaskQueueReceipt: ...


class CharacterGenerationRepository(Protocol):
    def get_character(self, name: str) -> Any | None: ...

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates: Any,
    ) -> Any: ...


class CharacterGenerationGateway(Protocol):
    async def generate_character_portrait(
        self,
        *,
        character: Any,
        project_dir: Path,
        output_dir: str | Path,
        options: CharacterGenerationOptions,
    ) -> Path | None: ...

    async def generate_identity_portrait(
        self,
        *,
        character: Any,
        identity: Any,
        project_dir: Path,
        options: CharacterGenerationOptions,
    ) -> Path | None: ...

    def resolve_identity_assets(
        self,
        *,
        character: Any,
        identity: Any,
        project_dir: Path,
    ) -> IdentityGenerationAssets: ...

    def prepare_identity_image_output(
        self,
        *,
        character: Any,
        identity: Any,
        project_dir: Path,
    ) -> Path: ...

    async def generate_identity_image(
        self,
        *,
        character: Any,
        identity: Any,
        project_dir: Path,
        output_path: Path,
        identity_prompt: str,
        reference_image_path: str,
        costume_image_path: str,
        options: CharacterGenerationOptions,
        usage_scope: str,
    ) -> Any: ...


class CharacterCatalogRepository(Protocol):
    def get_all_characters(self) -> list[Any]: ...

    def get_character(self, name: str) -> Any | None: ...

    async def add_character(self, character: Any) -> Any: ...

    async def update_character(self, name: str, **updates: Any) -> Any: ...

    async def rename_character(self, old_name: str, new_name: str) -> Any: ...

    async def delete_character(self, name: str) -> Any: ...


class CharacterFactory(Protocol):
    def create(self, command: CreateCharacterCommand) -> Any: ...


class CharacterCatalogAssets(Protocol):
    def portrait_path(self, project_dir: Path, character_name: str) -> str: ...

    def updated_at(self, project_dir: Path, character: Any) -> str: ...


class CharacterReferenceSource(Protocol):
    def character_names(
        self,
        beats: list[dict[str, Any]],
        known_character_names: list[str],
        *,
        use_detected_identities: bool,
    ) -> list[str]: ...

    def identity_ids(
        self,
        beats: list[dict[str, Any]],
        character_name: str,
        *,
        use_detected_identities: bool,
    ) -> list[str]: ...


class CharacterReferenceAssets(Protocol):
    def composite_identity_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> str: ...

    def primary_identity_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        stored_path: str | Path | None,
    ) -> str: ...

    def secondary_identity_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        stored_path: str | Path | None,
    ) -> str: ...

    def character_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        stored_path: str | Path | None,
    ) -> str: ...


class SceneCatalogRepository(Protocol):
    async def list_scenes(self) -> list[Any]: ...

    async def get_scene(self, name: str) -> Any | None: ...

    async def add_scene(self, scene: Any) -> Any: ...

    async def update_scene(self, name: str, **updates: Any) -> Any: ...

    async def rename_scene(self, old_name: str, new_name: str) -> Any: ...

    async def delete_scene(self, name: str) -> Any: ...


class SceneFactory(Protocol):
    def create(self, command: CreateSceneCommand) -> Any: ...


class SceneCatalogAssets(Protocol):
    def project(
        self,
        *,
        project_dir: Path,
        scene: Any,
        base_scene: Any | None,
        asset_url: Callable[[str | Path], str],
    ) -> dict[str, Any]: ...

    def rename_directories(
        self,
        project_dir: Path,
        old_name: str,
        new_name: str,
    ) -> None: ...


class SceneTaskRepository(Protocol):
    async def get_scene(self, name: str) -> Any | None: ...


class SceneTaskAssets(Protocol):
    def has_master(self, project_dir: Path, scene_name: str) -> bool: ...

    def has_reverse_master(self, project_dir: Path, scene_name: str) -> bool: ...

    def has_pano(self, project_dir: Path, scene_name: str) -> bool: ...

    def stage_generation_capability(self, step: str) -> tuple[bool, str]: ...


class SceneTaskScheduler(Protocol):
    async def enqueue_build_scenes(
        self,
        task_context: ProjectContext,
        task: BuildScenesTask,
    ) -> AssetTaskQueueReceipt: ...

    async def enqueue_scene_reference(
        self,
        task_context: ProjectContext,
        task: SceneReferenceGenerationTask,
    ) -> AssetTaskQueueReceipt: ...

    async def enqueue_scene_stage(
        self,
        task_context: ProjectContext,
        task: SceneStageGenerationTask,
    ) -> AssetTaskQueueReceipt: ...


class SceneMediaRepository(Protocol):
    async def get_scene(self, name: str) -> Any | None: ...


class SceneMediaUpload(Protocol):
    filename: str | None
    file: BinaryIO

    async def read(self) -> bytes: ...


class SceneMediaFiles(Protocol):
    def save_master(
        self,
        project_dir: Path,
        scene_name: str,
        content: bytes,
    ) -> Path: ...

    def delete_master(self, project_dir: Path, scene_name: str) -> bool: ...

    def save_pano(
        self,
        project_dir: Path,
        scene_name: str,
        content: bytes,
    ) -> Path: ...

    def delete_pano(self, project_dir: Path, scene_name: str) -> bool: ...

    def save_custom_package(
        self,
        project_dir: Path,
        scene_name: str,
        suffix: str,
        stream: BinaryIO,
    ) -> dict[str, Any]: ...

    def delete_custom_package(self, project_dir: Path, scene_name: str) -> bool: ...


class SceneViewerRepository(Protocol):
    async def list_scenes(self) -> list[Any]: ...

    async def get_scene(self, name: str) -> Any | None: ...


class SceneViewerAssets(Protocol):
    def has_master(self, project_dir: Path, scene_name: str) -> bool: ...

    def load(self, project_dir: Path, scene_name: str) -> SceneViewerAssetState: ...

    def filesystem_url(self, path: Path) -> str: ...

    def director_blockings_filesystem_url(
        self,
        project_dir: Path,
        episode_num: int,
    ) -> str: ...

    def director_control_frames_filesystem_url(self, project_dir: Path) -> str: ...

    def set_pano_correction(
        self,
        project_dir: Path,
        scene_name: str,
        correction: Mapping[str, Any],
    ) -> None: ...

    def save_director_world(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        active_source_id: str,
        snapshot: dict[str, Any],
        active_source: dict[str, Any] | None,
    ) -> dict[str, Any]: ...

    def save_director_world_source(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        source_id: str,
        snapshot: dict[str, Any],
        source: dict[str, Any] | None,
    ) -> dict[str, Any]: ...

    def clear_director_world(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        active_source_id: str | None,
    ) -> dict[str, Any]: ...


class BeatDirectorStageRepository(Protocol):
    async def get_beats_as_dicts(self, episode_num: int) -> list[dict[str, Any]]: ...


class BeatViewerStore(Protocol):
    async def get_beats_as_dicts(self, episode_num: int) -> list[dict[str, Any]]: ...

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]: ...

    async def update_beat_asset(
        self,
        *,
        episode_number: int,
        beat_number: int,
        **updates: Any,
    ) -> Any: ...


class BeatViewerWorkspace(Protocol):
    def session(
        self,
        context: ProjectContext,
    ) -> AbstractAsyncContextManager[BeatViewerStore]: ...


class BeatViewerEpisodeSource(Protocol):
    def episode_or_none(
        self,
        store: BeatViewerStore,
        episode_num: int,
    ) -> Any | None: ...


class BeatViewerRuntimePropMenuSource(Protocol):
    def for_episode(
        self,
        store: BeatViewerStore,
        episode: Any,
        beats: list[dict[str, Any]],
    ) -> list[dict[str, Any]]: ...


class BeatViewerMediaUrls(Protocol):
    def asset_url(
        self,
        context: ProjectContext,
    ) -> Callable[[str | Path], str]: ...


class BeatAssetWriter(Protocol):
    async def update_beat_asset(
        self,
        *,
        episode_number: int,
        beat_number: int,
        **updates: Any,
    ) -> Any: ...


class BeatDirectorStageFiles(Protocol):
    def overlay_path(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> Path: ...

    def load_overlay(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> dict[str, Any] | None: ...

    def save_overlay(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        payload: dict[str, Any],
    ) -> Path: ...

    def control_frame_path(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> Path: ...

    def exists(self, path: Path) -> bool: ...

    def project_relative_path(self, project_dir: Path, path: Path) -> str | None: ...

    def export_control_frame(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        *,
        images: Mapping[str, str],
        meta: Mapping[str, Any],
    ) -> DirectorControlFrameExport: ...


class BeatBackgroundAnchorFiles(Protocol):
    def anchor_path(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        episode_num: int,
        beat_num: int,
        anchor_id: str,
    ) -> Path | None: ...

    def selected_background_path(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> Path: ...

    def exists(self, path: Path) -> bool: ...

    def project_relative_path(self, project_dir: Path, path: Path) -> str: ...

    def infer_selected_source(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        episode_num: int,
        beat_num: int,
    ) -> str: ...

    def copy_to_selected(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        source_path: Path,
    ) -> Path: ...

    def crop_to_selected(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        source_path: Path,
        *,
        x: int,
        y: int,
        width: int,
        height: int,
    ) -> Path: ...

    def save_uploaded_image(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        image: Any,
    ) -> Path: ...


class PropCatalogRepository(Protocol):
    async def list_props(self) -> list[Any]: ...

    async def get_prop(self, name: str) -> Any | None: ...

    async def add_prop(self, prop: Any) -> Any: ...

    async def update_prop(self, name: str, **updates: Any) -> Any: ...

    async def rename_prop(self, old_name: str, new_name: str) -> Any: ...

    async def delete_prop(self, name: str) -> Any: ...

    async def list_episodes(self) -> list[Any]: ...


class PropFactory(Protocol):
    def create(self, command: CreatePropCommand) -> Any: ...


class PropCatalogAssets(Protocol):
    def reference_path(self, project_dir: Path, prop_name: str) -> str: ...

    def updated_at(self, project_dir: Path, prop: Any) -> str: ...

    def rename_directory(
        self,
        project_dir: Path,
        old_name: str,
        new_name: str,
    ) -> None: ...


class EpisodeLocalPropSource(Protocol):
    def normalize_menu(self, prop_menu: list[Any]) -> list[Any]: ...

    def episode_menu(self, episode: Any) -> list[dict[str, Any]]: ...

    def marker_prop_ids(self, beats: list[dict[str, Any]]) -> list[str]: ...

    async def list_props(
        self,
        repository: PropCatalogRepository,
        global_prop_names: set[str],
    ) -> list[dict[str, Any]]: ...


class PropPromotionRepository(Protocol):
    def available(self) -> bool: ...

    async def list_props(self) -> list[Any]: ...

    async def add_prop(self, prop: Any) -> Any: ...


class CachedPropRepository(Protocol):
    def available(self) -> bool: ...

    def get_cached_prop(self, prop_id: str) -> Any | None: ...


class PropTaskRepository(Protocol):
    async def get_prop(self, name: str) -> Any | None: ...


class PropTaskScheduler(Protocol):
    async def enqueue_prop_reference(
        self,
        task_context: ProjectContext,
        task: PropReferenceGenerationTask,
    ) -> AssetTaskQueueReceipt: ...

    async def enqueue_batch_prop_references(
        self,
        task_context: ProjectContext,
        task: BatchPropReferenceGenerationTask,
    ) -> AssetTaskQueueReceipt: ...


class CharacterIdentityRepository(Protocol):
    def get_all_characters(self) -> list[Any]: ...

    def get_character(self, name: str) -> Any | None: ...

    async def add_character_identity(
        self,
        character_name: str,
        identity: Any,
    ) -> Any: ...

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates: Any,
    ) -> Any: ...

    async def delete_character_identity(
        self,
        character_name: str,
        identity_id: str,
    ) -> Any: ...


class CharacterIdentityFactory(Protocol):
    def create(
        self,
        character_name: str,
        command: CreateIdentityCommand,
    ) -> Any: ...


class CharacterIdentityAssets(Protocol):
    def paths(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> IdentityAssetPaths: ...

    def updated_at(
        self,
        character: Any,
        identity: Any,
        paths: IdentityAssetPaths,
    ) -> str: ...


class CharacterIdentityAssetImporter(Protocol):
    async def import_asset(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        source_url: str,
        character_name: str,
        identity: Any,
    ) -> ImportedCharacterIdentityAsset: ...


class CharacterVoiceRepository(Protocol):
    def get_character(self, name: str) -> Any | None: ...

    async def update_character(self, name: str, **updates: Any) -> Any: ...


class CharacterVoiceUpload(Protocol):
    filename: str | None

    async def read(self) -> bytes: ...


class CharacterVoiceFiles(Protocol):
    def decode_recording(self, data_url: str) -> tuple[bytes, str]: ...

    def persist(
        self,
        *,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        filename: str,
        content: bytes,
    ) -> tuple[str, str, str]: ...

    def trim(
        self,
        *,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        source_path: str | Path,
        start_seconds: float,
        duration_seconds: float,
    ) -> tuple[str, str, str]: ...

    def clear(
        self,
        *,
        project_dir: str | Path,
        character_name: str,
        slot: str,
    ) -> bool: ...


class StyleCatalog(Protocol):
    def list_all_styles(
        self,
        *,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]: ...

    def get_style(
        self,
        style_id: str,
        *,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> Any | None: ...

    def get_preset(self, style_id: str) -> Any | None: ...

    def build_style_config(self, payload: Mapping[str, Any]) -> Any: ...

    def validate_style_preview_path(
        self,
        username: str,
        style_id: str,
        preview_path: str,
    ) -> str: ...

    def find_style_preview(
        self,
        username: str,
        style_id: str,
    ) -> str | None: ...

    def save_custom_style(
        self,
        style_id: str,
        config: Any,
        *,
        username: str,
    ) -> bool: ...

    def delete_custom_style(
        self,
        style_id: str,
        *,
        username: str,
    ) -> bool: ...

    def update_custom_style_preview(
        self,
        style_id: str,
        preview_path: str,
        *,
        username: str,
    ) -> bool: ...

    def stage_style_preview(
        self,
        username: str,
        content: bytes,
        extension: str,
    ) -> str: ...

    def finalize_style_preview(
        self,
        username: str,
        style_id: str,
        staged_path: str,
    ) -> str: ...

    def preset_preview_path(self, style_id: str) -> Path: ...

    def resolve_style_preview_path(
        self,
        username: str,
        preview_path: str,
    ) -> Path | None: ...


class StylePreviewGenerator(Protocol):
    async def generate(
        self,
        *,
        prompt: str,
        style_id: str,
        project_dir: Path,
    ) -> Sequence[str | Path]: ...


class StyleTaskScheduler(Protocol):
    async def enqueue_style_preview(
        self,
        task_context: ProjectContext,
        task: StylePreviewGenerationTask,
    ) -> AssetTaskQueueReceipt: ...


class StyleImageAnalyzer(Protocol):
    async def analyze(
        self,
        content: bytes,
        *,
        mime_type: str,
    ) -> Mapping[str, Any]: ...


class StyleUsageMeter(Protocol):
    def set_llm_usage_context(
        self,
        user_id: str,
        *,
        project_id: str | None = None,
        resource_kind: str | None = None,
        billing_metadata: dict[str, Any] | None = None,
    ) -> None: ...

    def clear_llm_usage_context(self) -> None: ...
