"""Creative Canvas audio-library application use cases."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.project_workspace.public import ProjectContext


class InvalidCreativeCanvasAudioLibraryRequest(ValueError):
    pass


class CreativeCanvasAudioVoiceMissing(RuntimeError):
    pass


@dataclass(frozen=True)
class ListCreativeCanvasAudioReferencesQuery:
    context: ProjectContext
    project_dir: Path


@dataclass(frozen=True)
class CreateCreativeCanvasAudioVoiceCommand:
    context: ProjectContext
    name: str
    filename: str | None
    content: bytes
    mime_type: str = ""


@dataclass(frozen=True)
class CreateCreativeCanvasPresetVoiceCommand:
    context: ProjectContext
    project_dir: Path
    name: str
    model_selector: str
    voice: str
    text: str


@dataclass(frozen=True)
class GeneratedCreativeCanvasPresetVoice:
    filename: str
    content: bytes
    mime_type: str
    model: str


@dataclass(frozen=True)
class GetCreativeCanvasAudioVoiceQuery:
    context: ProjectContext
    voice_id: str


@dataclass(frozen=True)
class DeleteCreativeCanvasAudioVoiceCommand:
    context: ProjectContext
    voice_id: str


class CreativeCanvasAudioLibraryGateway(Protocol):
    async def list_references(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        account_username: str,
    ) -> Mapping[str, Any]: ...

    def create_voice(
        self,
        *,
        context: ProjectContext,
        account_username: str,
        name: str,
        filename: str | None,
        content: bytes,
        mime_type: str,
    ) -> Mapping[str, Any]: ...

    def resolve_voice(
        self,
        *,
        account_username: str,
        voice_id: str,
    ) -> Path: ...

    def delete_voice(
        self,
        *,
        account_username: str,
        voice_id: str,
    ) -> None: ...


class CreativeCanvasPresetVoiceGenerator(Protocol):
    async def generate(
        self,
        command: CreateCreativeCanvasPresetVoiceCommand,
    ) -> GeneratedCreativeCanvasPresetVoice: ...


class CreativeCanvasAudioLibraryUseCases:
    def __init__(
        self,
        gateway: CreativeCanvasAudioLibraryGateway,
        preset_voice_generator: CreativeCanvasPresetVoiceGenerator,
    ) -> None:
        self._gateway = gateway
        self._preset_voice_generator = preset_voice_generator

    async def list_references(
        self,
        query: ListCreativeCanvasAudioReferencesQuery,
    ) -> Mapping[str, Any]:
        return await self._gateway.list_references(
            context=query.context,
            project_dir=query.project_dir,
            account_username=_account_username(query.context),
        )

    def create_voice(
        self,
        command: CreateCreativeCanvasAudioVoiceCommand,
    ) -> Mapping[str, Any]:
        try:
            return self._gateway.create_voice(
                context=command.context,
                account_username=_account_username(command.context),
                name=command.name or Path(command.filename or "").stem,
                filename=command.filename,
                content=command.content,
                mime_type=command.mime_type,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasAudioLibraryRequest(str(exc)) from exc

    async def create_preset_voice(
        self,
        command: CreateCreativeCanvasPresetVoiceCommand,
    ) -> Mapping[str, Any]:
        generated = await self._preset_voice_generator.generate(command)
        return self.create_voice(
            CreateCreativeCanvasAudioVoiceCommand(
                context=command.context,
                name=command.name or command.voice or generated.model,
                filename=generated.filename,
                content=generated.content,
                mime_type=generated.mime_type,
            )
        )

    def get_voice(
        self,
        query: GetCreativeCanvasAudioVoiceQuery,
    ) -> Path:
        try:
            return self._gateway.resolve_voice(
                account_username=_account_username(query.context),
                voice_id=query.voice_id,
            )
        except RuntimeError as exc:
            raise CreativeCanvasAudioVoiceMissing(str(exc)) from exc

    def delete_voice(
        self,
        command: DeleteCreativeCanvasAudioVoiceCommand,
    ) -> None:
        try:
            self._gateway.delete_voice(
                account_username=_account_username(command.context),
                voice_id=command.voice_id,
            )
        except RuntimeError as exc:
            raise CreativeCanvasAudioVoiceMissing(str(exc)) from exc


def _account_username(context: ProjectContext) -> str:
    return context.requester_username or context.owner_username


__all__ = [
    "CreateCreativeCanvasAudioVoiceCommand",
    "CreateCreativeCanvasPresetVoiceCommand",
    "DeleteCreativeCanvasAudioVoiceCommand",
    "CreativeCanvasAudioLibraryGateway",
    "CreativeCanvasAudioLibraryUseCases",
    "CreativeCanvasPresetVoiceGenerator",
    "CreativeCanvasAudioVoiceMissing",
    "GetCreativeCanvasAudioVoiceQuery",
    "GeneratedCreativeCanvasPresetVoice",
    "InvalidCreativeCanvasAudioLibraryRequest",
    "ListCreativeCanvasAudioReferencesQuery",
]
