from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.canvas import audio as audio_routes
from ai_anime.modules.creative_canvas.application.audio_library import (
    CreateCreativeCanvasAudioVoiceCommand,
    CreativeCanvasAudioLibraryUseCases,
    CreativeCanvasAudioVoiceMissing,
    GetCreativeCanvasAudioVoiceQuery,
    InvalidCreativeCanvasAudioLibraryRequest,
    ListCreativeCanvasAudioReferencesQuery,
)
from ai_anime.modules.creative_canvas.infrastructure.audio_library import (
    LocalCreativeCanvasAudioLibraryGateway,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _project_context(
    tmp_path: Path,
    *,
    requester_username: str = "viewer",
) -> ProjectContext:
    project_dir = tmp_path / "output"
    return ProjectContext(
        project_id="proj_demo",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="owner",
        requester_user_id="viewer-1",
        requester_username=requester_username,
        requester_principals=(("user", "viewer-1"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=project_dir,
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_audio_library_adapter_preserves_reference_contract(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    project_dir = context.output_dir
    narrator_path = project_dir / "assets" / "narrator" / "voice.wav"
    default_path = project_dir / "assets" / "characters" / "林小满" / "default.mp3"
    youth_path = project_dir / "assets" / "characters" / "林小满" / "youth.mp3"
    external_path = tmp_path / "outside.mp3"
    for path in (narrator_path, default_path, youth_path, external_path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"audio")

    identity = SimpleNamespace(
        identity_id="林小满_青年",
        identity_name="青年",
        age_group="youth",
        reference_audio_path=str(external_path),
        reference_audio_sha256="identity-sha",
        reference_audio_updated_at="identity-updated",
    )
    character = SimpleNamespace(
        name="林小满",
        is_main=True,
        age_group="youth",
        reference_audio_path="assets/characters/林小满/default.mp3",
        reference_audio_sha256="default-sha",
        reference_audio_updated_at="default-updated",
        voice_samples_by_age_group={
            "youth": {
                "path": "assets/characters/林小满/youth.mp3",
                "sha256": "youth-sha",
                "updated_at": "youth-updated",
            }
        },
        identities=[identity],
    )

    class Store:
        closed = False

        async def list_characters(self):
            return [character]

        async def close(self):
            self.closed = True

    store = Store()
    owner_lookups: list[tuple[str, str]] = []
    account_lookups: list[str] = []
    static_paths: list[str] = []

    async def store_factory(received_context):
        assert received_context is context
        return store

    def narrator_reference_loader(username: str, project: str):
        owner_lookups.append((username, project))
        return {
            "path": "assets/narrator/voice.wav",
            "sha256": "narrator-sha",
            "updated_at": "narrator-updated",
        }

    def narration_style_loader(username: str, project: str):
        owner_lookups.append((username, project))
        return "third_person"

    def user_voice_lister(username: str):
        account_lookups.append(username)
        return [
            {
                "scope": "user_custom",
                "voice_id": "fv_viewer",
                "label": "Viewer Voice",
                "path": "_account/freezone/audio/voices/fv_viewer.mp3",
                "exists": True,
            }
        ]

    def character_voice_resolver(**_kwargs):
        return SimpleNamespace(
            audio_path=default_path,
            sha256="resolved-sha",
            tier="character_default",
        )

    def static_url_builder(_context, relative_path, _local_path=None):
        static_paths.append(relative_path)
        return f"/static/projects/proj_demo/{relative_path}"

    gateway = LocalCreativeCanvasAudioLibraryGateway(
        store_factory=store_factory,
        narrator_reference_loader=narrator_reference_loader,
        narration_style_loader=narration_style_loader,
        user_voice_lister=user_voice_lister,
        character_voice_resolver=character_voice_resolver,
        static_url_builder=static_url_builder,
    )

    result = await gateway.list_references(
        context=context,
        project_dir=project_dir,
        account_username="viewer",
    )

    assert owner_lookups == [("owner", "demo"), ("owner", "demo")]
    assert account_lookups == ["viewer"]
    assert store.closed is True
    assert result["narration_style"] == "third_person"
    assert result["narrator"]["exists"] is True
    assert result["user_voices"][0]["url"] == (
        "/api/v1/projects/proj_demo/freezone/audio/voices/fv_viewer/media"
    )

    character_payload = result["characters"][0]
    assert character_payload["available_count"] == 3
    assert character_payload["voices"][0]["url"] == (
        "/static/projects/proj_demo/assets/characters/林小满/default.mp3"
    )
    youth_voice = next(
        item for item in character_payload["voices"] if item["slot"] == "youth"
    )
    assert youth_voice["exists"] is True
    identity_payload = character_payload["identities"][0]
    assert identity_payload["path"] == str(external_path)
    assert identity_payload["url"] == ""
    assert identity_payload["exists"] is False
    assert identity_payload["resolved"]["exists"] is True
    assert "assets/characters/林小满/default.mp3" in static_paths
    assert len(result["available"]) == 5


class _CapturingAudioLibraryGateway:
    def __init__(self, media_path: Path) -> None:
        self.media_path = media_path
        self.calls: list[tuple[str, object]] = []

    async def list_references(self, **kwargs):
        self.calls.append(("list", kwargs))
        return {"available": []}

    def create_voice(self, **kwargs):
        self.calls.append(("create", kwargs))
        return {"voice_id": "fv_created", "name": kwargs["name"]}

    def resolve_voice(self, **kwargs):
        self.calls.append(("resolve", kwargs))
        return self.media_path


@pytest.mark.asyncio
async def test_audio_library_use_cases_apply_account_and_name_rules(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    gateway = _CapturingAudioLibraryGateway(tmp_path / "voice.mp3")
    use_cases = CreativeCanvasAudioLibraryUseCases(gateway)

    await use_cases.list_references(
        ListCreativeCanvasAudioReferencesQuery(
            context=context,
            project_dir=context.output_dir,
        )
    )
    created = use_cases.create_voice(
        CreateCreativeCanvasAudioVoiceCommand(
            context=context,
            name="",
            filename="sample.voice.mp3",
            content=b"voice",
            mime_type="audio/mpeg",
        )
    )
    resolved = use_cases.get_voice(
        GetCreativeCanvasAudioVoiceQuery(
            context=context,
            voice_id="fv_created",
        )
    )

    assert created["name"] == "sample.voice"
    assert resolved == tmp_path / "voice.mp3"
    assert [call[1]["account_username"] for call in gateway.calls] == [
        "viewer",
        "viewer",
        "viewer",
    ]

    owner_context = _project_context(tmp_path, requester_username="")
    await use_cases.list_references(
        ListCreativeCanvasAudioReferencesQuery(
            context=owner_context,
            project_dir=owner_context.output_dir,
        )
    )
    assert gateway.calls[-1][1]["account_username"] == "owner"


def test_audio_library_use_cases_translate_gateway_errors(tmp_path: Path) -> None:
    context = _project_context(tmp_path)

    class Gateway(_CapturingAudioLibraryGateway):
        def create_voice(self, **kwargs):
            raise ValueError("voice audio file is empty")

        def resolve_voice(self, **kwargs):
            raise RuntimeError("用户音色不存在: fv_missing")

    use_cases = CreativeCanvasAudioLibraryUseCases(Gateway(tmp_path / "missing.mp3"))

    with pytest.raises(
        InvalidCreativeCanvasAudioLibraryRequest,
        match="voice audio file is empty",
    ):
        use_cases.create_voice(
            CreateCreativeCanvasAudioVoiceCommand(
                context=context,
                name="voice",
                filename="voice.mp3",
                content=b"",
            )
        )
    with pytest.raises(
        CreativeCanvasAudioVoiceMissing,
        match="用户音色不存在: fv_missing",
    ):
        use_cases.get_voice(
            GetCreativeCanvasAudioVoiceQuery(
                context=context,
                voice_id="fv_missing",
            )
        )


@pytest.mark.asyncio
async def test_audio_library_routes_preserve_permissions_and_responses(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)
    media_path = tmp_path / "voice.mp3"
    media_path.write_bytes(b"voice")
    resolutions: list[tuple[str, str]] = []
    commands: list[object] = []

    async def resolve_project_scope(
        project,
        user,
        *,
        required_role,
        operation,
    ):
        assert project == "proj_demo"
        assert user == {"username": "viewer"}
        resolutions.append((required_role, operation))
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class UseCases:
        async def list_references(self, query):
            commands.append(query)
            return {"available": []}

        def create_voice(self, command):
            commands.append(command)
            return {"voice_id": "fv_created", "url": "/voice"}

        def get_voice(self, query):
            commands.append(query)
            return media_path

    class Upload:
        filename = "voice.mp3"
        content_type = "audio/mpeg"

        async def read(self):
            return b"voice"

    monkeypatch.setattr(audio_routes, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(
        audio_routes,
        "creative_canvas_audio_library_use_cases",
        lambda: UseCases(),
    )

    references = await audio_routes.freezone_audio_references(
        "proj_demo",
        user={"username": "viewer"},
    )
    created = await audio_routes.create_freezone_audio_voice(
        "proj_demo",
        file=Upload(),
        name="",
        user={"username": "viewer"},
    )
    media = await audio_routes.get_freezone_audio_voice_media(
        "proj_demo",
        "fv_created",
        user={"username": "viewer"},
    )

    assert references == {"ok": True, "data": {"available": []}}
    assert created == {
        "ok": True,
        "data": {"voice_id": "fv_created", "url": "/voice"},
    }
    assert Path(media.path) == media_path
    assert resolutions == [
        ("viewer", "access freezone project files"),
        ("editor", "access freezone project files"),
        ("viewer", "access freezone project files"),
    ]
    assert commands[1].filename == "voice.mp3"
    assert commands[1].content == b"voice"


@pytest.mark.asyncio
async def test_audio_library_routes_map_application_errors(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)

    async def resolve_project_scope(*_args, **_kwargs):
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class UseCases:
        def create_voice(self, _command):
            raise InvalidCreativeCanvasAudioLibraryRequest("voice audio file is empty")

        def get_voice(self, _query):
            raise CreativeCanvasAudioVoiceMissing("用户音色不存在: fv_missing")

    class Upload:
        filename = "voice.mp3"
        content_type = "audio/mpeg"

        async def read(self):
            return b""

    monkeypatch.setattr(audio_routes, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(
        audio_routes,
        "creative_canvas_audio_library_use_cases",
        lambda: UseCases(),
    )

    with pytest.raises(HTTPException) as invalid:
        await audio_routes.create_freezone_audio_voice(
            "proj_demo",
            file=Upload(),
            user={"username": "viewer"},
        )
    assert invalid.value.status_code == 400
    assert invalid.value.detail == "voice audio file is empty"

    with pytest.raises(HTTPException) as missing:
        await audio_routes.get_freezone_audio_voice_media(
            "proj_demo",
            "fv_missing",
            user={"username": "viewer"},
        )
    assert missing.value.status_code == 404
    assert missing.value.detail == "用户音色不存在: fv_missing"
