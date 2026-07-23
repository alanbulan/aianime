"""Ports required by Asset & World use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence

from ai_anime.modules.asset_world.application.dto import (
    AssetTaskQueueReceipt,
    BuildCharactersTask,
    CharacterAssetHistoryEntry,
    CharacterAssetTarget,
    CharacterImageGenerationTask,
    CreateCharacterCommand,
    CreateIdentityCommand,
    IdentityAssetPaths,
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
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]: ...

    def get_style(
        self,
        style_id: str,
        *,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> Any | None: ...

    def get_preset(self, style_id: str) -> Any | None: ...

    def build_style_config(self, payload: Mapping[str, Any]) -> Any: ...

    def validate_style_preview_path(
        self,
        project_dir: str | Path,
        style_id: str,
        preview_path: str,
    ) -> str: ...

    def find_style_preview(
        self,
        project_dir: str | Path,
        style_id: str,
    ) -> str | None: ...

    def save_custom_style(
        self,
        style_id: str,
        config: Any,
        *,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool: ...

    def delete_custom_style(
        self,
        style_id: str,
        *,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool: ...

    def stage_style_preview(
        self,
        project_dir: str | Path,
        content: bytes,
        extension: str,
    ) -> str: ...

    def finalize_style_preview(
        self,
        project_dir: str | Path,
        style_id: str,
        staged_path: str,
    ) -> str: ...

    def preset_preview_path(self, style_id: str) -> Path: ...

    def resolve_project_preview_path(
        self,
        project_dir: str | Path,
        preview_path: str,
    ) -> Path | None: ...


class StylePreviewGenerator(Protocol):
    async def generate(
        self,
        *,
        prompt: str,
        style_id: str,
        model: str,
    ) -> Sequence[str | Path]: ...


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
