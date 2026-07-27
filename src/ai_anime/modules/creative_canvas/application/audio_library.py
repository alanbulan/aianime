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
class GetCreativeCanvasAudioVoiceQuery:
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


class CreativeCanvasAudioLibraryUseCases:
    def __init__(self, gateway: CreativeCanvasAudioLibraryGateway) -> None:
        self._gateway = gateway

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


def _account_username(context: ProjectContext) -> str:
    return context.requester_username or context.owner_username


__all__ = [
    "CreateCreativeCanvasAudioVoiceCommand",
    "CreativeCanvasAudioLibraryGateway",
    "CreativeCanvasAudioLibraryUseCases",
    "CreativeCanvasAudioVoiceMissing",
    "GetCreativeCanvasAudioVoiceQuery",
    "InvalidCreativeCanvasAudioLibraryRequest",
    "ListCreativeCanvasAudioReferencesQuery",
]
