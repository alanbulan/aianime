"""Commands and results owned by Asset & World use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, Mapping, Sequence


@dataclass(frozen=True)
class CreateCharacterCommand:
    name: str
    role: str = ""
    is_main: bool = False
    gender: str = ""
    age_group: str = "youth"
    description: str = ""
    face_prompt: str = ""


@dataclass(frozen=True)
class UpdateCharacterCommand:
    fields: Mapping[str, Any]


@dataclass(frozen=True)
class CreateSceneCommand:
    name: str
    aliases: Sequence[str] = ()
    scene_type: str = "interior"
    base_scene_id: str = ""
    variant_id: str = ""
    time_of_day: str = ""
    environment_prompt: str = ""
    variant_prompt: str = ""
    description: str = ""
    spatial_layout_image: str = ""
    notes: str = ""


@dataclass(frozen=True)
class UpdateSceneCommand:
    fields: Mapping[str, Any]


@dataclass(frozen=True)
class CreatePropCommand:
    name: str
    aliases: Sequence[str] = ()
    prop_type: str = "object"
    visual_prompt: str = ""
    description: str = ""
    owner: str = ""
    notes: str = ""


@dataclass(frozen=True)
class UpdatePropCommand:
    fields: Mapping[str, Any]


@dataclass(frozen=True)
class CreateIdentityCommand:
    identity_name: str
    age_group: str = ""
    appearance_details: str = ""


@dataclass(frozen=True)
class UpdateIdentityCommand:
    fields: Mapping[str, Any]


@dataclass(frozen=True)
class IdentityAssetPaths:
    image: str = ""
    costume: str = ""
    portrait: str = ""


@dataclass(frozen=True)
class RestoreCharacterAssetCommand:
    kind: str
    identity_id: str
    history_id: str


@dataclass(frozen=True)
class CharacterAssetTarget:
    path: Path
    identity: Any | None = None


@dataclass(frozen=True)
class CharacterAssetHistoryEntry:
    history_id: str
    filename: str
    path: Path
    created_at: str
    bytes: int


@dataclass(frozen=True)
class BuildCharactersTask:
    output_dir: str | Path

    def backend_payload(self) -> dict[str, Any]:
        return {"output_dir": str(self.output_dir)}


@dataclass(frozen=True)
class BuildScenesTask:
    task_type: ClassVar[str] = "build_scenes"

    output_dir: str | Path

    def backend_payload(self) -> dict[str, Any]:
        return {"output_dir": str(self.output_dir)}


@dataclass(frozen=True)
class CharacterImageGenerationTask:
    mode: str
    task_type: str
    character_name: str
    style: str
    model: str
    scope: str
    output_dir: str | Path
    identity_id: str = ""
    identity_name: str = ""

    def backend_payload(self) -> dict[str, Any]:
        payload = {
            "mode": self.mode,
            "task_type": self.task_type,
            "character_name": self.character_name,
        }
        if self.identity_id or self.identity_name:
            payload.update(
                identity_id=self.identity_id,
                identity_name=self.identity_name,
            )
        payload.update(
            style=self.style,
            model=self.model,
            scope=self.scope,
            output_dir=str(self.output_dir),
        )
        return payload


@dataclass(frozen=True)
class PropReferenceGenerationTask:
    task_type: ClassVar[str] = "prop_reference_asset"

    prop_name: str
    style: str
    model: str
    output_dir: str | Path
    scope: str

    def backend_payload(self) -> dict[str, Any]:
        return {
            "prop_name": self.prop_name,
            "style": self.style,
            "model": self.model,
            "output_dir": str(self.output_dir),
        }


@dataclass(frozen=True)
class BatchPropReferenceGenerationTask:
    task_type: ClassVar[str] = "batch_prop_ref"

    style: str
    model: str
    output_dir: str | Path

    def backend_payload(self) -> dict[str, Any]:
        return {
            "style": self.style,
            "model": self.model,
            "output_dir": str(self.output_dir),
        }


@dataclass(frozen=True)
class SceneReferenceGenerationTask:
    task_type: ClassVar[str] = "scene_reference_asset"

    scene_name: str
    kind: str
    style: str
    model: str
    output_dir: str | Path
    scope: str

    def backend_payload(self) -> dict[str, Any]:
        return {
            "scene_name": self.scene_name,
            "kind": self.kind,
            "model": self.model,
            "style": self.style,
            "output_dir": str(self.output_dir),
        }


@dataclass(frozen=True)
class AssetTaskQueueReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledAssetTask:
    task_type: str
    task_id: str
    task_key: str
    backend: str
    queue: str | None
    message: str
    scope: str | None = None

    @classmethod
    def from_receipt(
        cls,
        receipt: AssetTaskQueueReceipt,
        *,
        task_type: str,
        message: str,
        scope: str | None = None,
    ) -> ScheduledAssetTask:
        return cls(
            task_type=task_type,
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            message=message,
            scope=scope,
        )

    def as_dict(self) -> dict[str, Any]:
        data = {
            "task_type": self.task_type,
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
            "message": self.message,
        }
        if self.scope is not None:
            data["scope"] = self.scope
        return data


@dataclass(frozen=True)
class CharacterGenerationOptions:
    style: str | None
    ethnicity: str
    model: str


@dataclass(frozen=True)
class IdentityGenerationAssets:
    costume_image: str
    identity_portrait: str
    character_portrait: str
    has_costume_image: bool
    has_identity_portrait: bool


@dataclass(frozen=True)
class StyleScope:
    username: str
    project_name: str | None = None
    project_dir: Path | None = None
    request_project: str | None = None


@dataclass(frozen=True)
class CreateCustomStyleCommand:
    style_id: str
    name: str | None
    config: Mapping[str, Any] | None
    preview_path: str | None = None


@dataclass(frozen=True)
class StyleFile:
    path: Path
    media_type: str
    filename: str | None = None


@dataclass(frozen=True)
class StyleAnalysisBilling:
    billing_user_id: str
    project_id: str
    requester_user_id: str
    project_owner_id: str

    @classmethod
    def from_project_context(cls, context: Any) -> "StyleAnalysisBilling":
        requester_user_id = str(
            getattr(context, "requester_user_id", "") or ""
        ).strip()
        project_owner_id = str(getattr(context, "owner_id", "") or "").strip()
        return cls(
            billing_user_id=requester_user_id or project_owner_id,
            project_id=str(getattr(context, "project_id", "") or ""),
            requester_user_id=requester_user_id,
            project_owner_id=project_owner_id,
        )


@dataclass(frozen=True)
class AnalyzeStyleCommand:
    content: bytes
    mime_type: str
    filename: str | None
    style_id: str = ""
    billing: StyleAnalysisBilling | None = None
