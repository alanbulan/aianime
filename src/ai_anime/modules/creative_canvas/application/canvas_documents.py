"""Creative Canvas document-query application services."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.project_workspace.public import ProjectContext


class InvalidCreativeCanvasDocumentQuery(ValueError):
    pass


class CreativeCanvasDocumentCorrupt(RuntimeError):
    pass


class CreativeCanvasDocumentBusy(RuntimeError):
    def __init__(self, canvas_id: str) -> None:
        self.canvas_id = canvas_id
        super().__init__(f"canvas lock busy: {canvas_id}")


@dataclass(frozen=True)
class ListCreativeCanvasDocumentsQuery:
    context: ProjectContext
    actor_id: str


@dataclass(frozen=True)
class GetCreativeCanvasDocumentQuery:
    context: ProjectContext
    project_dir: Path
    canvas_id: str
    actor_id: str


@dataclass(frozen=True)
class ListCreativeCanvasDocumentHistoryQuery:
    context: ProjectContext
    canvas_id: str


@dataclass(frozen=True)
class ListCreativeCanvasNodeGenerationHistoryQuery:
    context: ProjectContext
    project_dir: Path
    canvas_id: str
    node_id: str
    limit: int


@dataclass(frozen=True)
class ListCreativeCanvasGenerationHistoryQuery:
    context: ProjectContext
    project_dir: Path
    canvas_id: str
    limit: int


class CreativeCanvasDocumentQueryGateway(Protocol):
    async def get_document(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        canvas_id: str,
        actor_id: str,
    ) -> Mapping[str, Any]: ...

    def list_documents(
        self,
        *,
        context: ProjectContext,
        actor_id: str,
    ) -> Sequence[Mapping[str, Any]]: ...

    def list_document_history(
        self,
        *,
        context: ProjectContext,
        canvas_id: str,
    ) -> Sequence[Mapping[str, Any]]: ...

    def list_node_generation_history(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        canvas_id: str,
        node_id: str,
        limit: int,
    ) -> Sequence[Mapping[str, Any]]: ...

    def list_generation_history(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        canvas_id: str,
        limit: int,
    ) -> Sequence[Mapping[str, Any]]: ...


class CreativeCanvasDocumentQueries:
    def __init__(self, gateway: CreativeCanvasDocumentQueryGateway) -> None:
        self._gateway = gateway

    def list_documents(
        self,
        query: ListCreativeCanvasDocumentsQuery,
    ) -> Sequence[Mapping[str, Any]]:
        return self._gateway.list_documents(
            context=query.context,
            actor_id=query.actor_id,
        )

    async def get_document(
        self,
        query: GetCreativeCanvasDocumentQuery,
    ) -> Mapping[str, Any]:
        try:
            return await self._gateway.get_document(
                context=query.context,
                project_dir=query.project_dir,
                canvas_id=query.canvas_id,
                actor_id=query.actor_id,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasDocumentQuery(str(exc)) from exc

    def list_document_history(
        self,
        query: ListCreativeCanvasDocumentHistoryQuery,
    ) -> Sequence[Mapping[str, Any]]:
        try:
            return self._gateway.list_document_history(
                context=query.context,
                canvas_id=query.canvas_id,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasDocumentQuery(str(exc)) from exc

    def list_node_generation_history(
        self,
        query: ListCreativeCanvasNodeGenerationHistoryQuery,
    ) -> Sequence[Mapping[str, Any]]:
        try:
            return self._gateway.list_node_generation_history(
                context=query.context,
                project_dir=query.project_dir,
                canvas_id=query.canvas_id,
                node_id=query.node_id,
                limit=query.limit,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasDocumentQuery(str(exc)) from exc

    def list_generation_history(
        self,
        query: ListCreativeCanvasGenerationHistoryQuery,
    ) -> Sequence[Mapping[str, Any]]:
        try:
            return self._gateway.list_generation_history(
                context=query.context,
                project_dir=query.project_dir,
                canvas_id=query.canvas_id,
                limit=query.limit,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasDocumentQuery(str(exc)) from exc


__all__ = [
    "CreativeCanvasDocumentBusy",
    "CreativeCanvasDocumentCorrupt",
    "CreativeCanvasDocumentQueries",
    "CreativeCanvasDocumentQueryGateway",
    "GetCreativeCanvasDocumentQuery",
    "InvalidCreativeCanvasDocumentQuery",
    "ListCreativeCanvasDocumentHistoryQuery",
    "ListCreativeCanvasDocumentsQuery",
    "ListCreativeCanvasGenerationHistoryQuery",
    "ListCreativeCanvasNodeGenerationHistoryQuery",
]
