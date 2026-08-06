from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.seedance2_panel import (
    CropSeedance2AssetCommand,
    RemoveSeedance2AssetCommand,
    Seedance2PanelBeatMissing,
    Seedance2PanelQuery,
    TrimSeedance2AudioAssetCommand,
    UploadSeedance2AssetCommand,
)
from ai_anime.modules.production.infrastructure.seedance2_panel import (
    LocalSeedance2PanelGateway,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class _Store:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats
        self.close_calls = 0

    async def get_beats_as_dicts(self, episode_num: int) -> list[dict]:
        assert episode_num == 2
        return self.beats

    def get_all_characters(self) -> list[str]:
        return ["character"]

    async def close(self) -> None:
        self.close_calls += 1


class _EpisodeSource:
    def __init__(self) -> None:
        self.calls: list[tuple[object, int]] = []

    def episode_or_none(self, store, episode_num: int):
        self.calls.append((store, episode_num))
        return "episode"


class _PropMenuSource:
    def __init__(self) -> None:
        self.calls: list[tuple[object, object, list[dict]]] = []

    async def for_episode(self, store, episode, beats):
        self.calls.append((store, episode, beats))
        return [{"id": "prop"}]


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="owner",
        home_node_id="local",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=True,
    )


def _gateway(monkeypatch, store: _Store):
    from ai_anime.modules.production.infrastructure import seedance2_panel

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        seedance2_panel.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    episode_source = _EpisodeSource()
    prop_menu_source = _PropMenuSource()
    return (
        LocalSeedance2PanelGateway(episode_source, prop_menu_source),
        episode_source,
        prop_menu_source,
    )


@pytest.mark.asyncio
async def test_status_projects_panel_state_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import seedance2_panel
    from ai_anime.shared.utils.path_resolver import PathResolver

    context = _context(tmp_path)
    beat = {
        "beat_number": 3,
        "audio_type": "silence",
        "seedance2_config_json": "{}",
    }
    store = _Store([beat, {"beat_number": 4}])
    gateway, _episode_source, _prop_menu_source = _gateway(monkeypatch, store)
    paths = PathResolver(Path(context.output_dir), 2)
    paths.frame(3).parent.mkdir(parents=True, exist_ok=True)
    paths.frame(3).write_bytes(b"frame")
    reference = Path(context.output_dir) / "references" / "image.png"
    reference.parent.mkdir(parents=True, exist_ok=True)
    reference.write_bytes(b"image")
    asset = SimpleNamespace(
        key="manual:image",
        label="参考图",
        media_type="image",
        selected=True,
        exists=True,
        required=True,
        reference_label="图片1",
        note="",
        validation_error="",
        fallback_text="",
        identity_id="",
        prop_id="",
        prop_scope="",
        path=reference,
        crop_source_path=None,
    )
    state = SimpleNamespace(
        assets=[asset],
        final_prompt="camera follows the subject",
        prompt_source="generated",
        prompt_status="ready",
        prompt_guidance="keep identity stable",
        text_overlay={"enabled": True, "text": "title"},
        prompt_inputs_hash="old",
        current_prompt_inputs_hash="new",
    )
    monkeypatch.setattr(
        seedance2_panel.panel_service,
        "build_seedance2_video_panel_state",
        lambda **_kwargs: state,
    )

    response = await gateway.status(
        context,
        Seedance2PanelQuery(project="demo", episode_num=2, beat_num=3),
    )

    data = response["data"]
    assert data["beat_number"] == 3
    assert data["audio_type"] == "silence"
    assert data["media"] == {
        "render_ready": True,
        "audio_ready": False,
        "video_ready": False,
    }
    assert data["voice"] == {
        "required": False,
        "ready": True,
        "label": "无音频",
        "detail": "静音 Beat 不生成音频",
        "speaker": "",
    }
    assert data["prompt"] == {
        "ready": True,
        "source": "generated",
        "status": "ready",
        "has_guidance": True,
        "text_overlay_enabled": True,
        "text_overlay": {"enabled": True, "text": "title"},
        "inputs_stale": True,
    }
    assert data["assets"] == {
        "total": 1,
        "selected": 1,
        "missing": 0,
        "images": 1,
        "audios": 0,
        "fallbacks": 0,
        "items": [
            {
                "key": "manual:image",
                "label": "参考图",
                "media_type": "image",
                "selected": True,
                "exists": True,
                "reference_label": "图片1",
                "note": "",
                "identity_id": "",
                "prop_id": "",
                "prop_scope": "",
                "path": str(Path("references") / "image.png"),
                "url": data["assets"]["items"][0]["url"],
                "abs_path": str(reference),
                "crop_source_path": "",
                "crop_source_abs_path": "",
                "crop_source_url": "",
                "validation_error": "",
                "fallback_text": "",
                "can_crop": True,
                "can_trim": False,
                "can_delete": False,
            }
        ],
    }
    assert data["assets"]["items"][0]["url"].startswith(
        "/static/projects/proj-1/references/image.png?v="
    )
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_missing_beat_closes_store(monkeypatch, tmp_path: Path) -> None:
    store = _Store([{"beat_number": 1}])
    gateway, episode_source, prop_menu_source = _gateway(monkeypatch, store)

    with pytest.raises(Seedance2PanelBeatMissing, match="Beat 9 not found"):
        await gateway.status(
            _context(tmp_path),
            Seedance2PanelQuery(project="demo", episode_num=2, beat_num=9),
        )

    assert store.close_calls == 1
    assert episode_source.calls == []
    assert prop_menu_source.calls == []


@pytest.mark.parametrize(
    ("gateway_method", "service_method", "command", "expected_fields"),
    [
        (
            "upload",
            "save_seedance2_uploaded_asset",
            UploadSeedance2AssetCommand(
                project="demo",
                episode_num=2,
                beat_num=3,
                filename="reference.png",
                content=b"image",
                content_type="image/png",
            ),
            {
                "filename": "reference.png",
                "content": b"image",
                "content_type": "image/png",
            },
        ),
        (
            "remove",
            "remove_seedance2_uploaded_asset",
            RemoveSeedance2AssetCommand(
                project="demo",
                episode_num=2,
                beat_num=3,
                media_kind="images",
                path="seedance2_uploads/reference.png",
            ),
            {
                "media_kind": "images",
                "path": "seedance2_uploads/reference.png",
            },
        ),
        (
            "crop",
            "crop_seedance2_asset_to_reference",
            CropSeedance2AssetCommand(
                project="demo",
                episode_num=2,
                beat_num=3,
                asset_key="manual:image",
                source_path="frames/reference.png",
                crop_data={"x": 1, "y": 2, "width": 3, "height": 4},
            ),
            {
                "asset_key": "manual:image",
                "source_path": "frames/reference.png",
                "crop_data": {"x": 1, "y": 2, "width": 3, "height": 4},
            },
        ),
        (
            "trim_audio",
            "trim_seedance2_audio_to_reference",
            TrimSeedance2AudioAssetCommand(
                project="demo",
                episode_num=2,
                beat_num=3,
                asset_key="manual:audio",
                source_path="audio/reference.wav",
                start_seconds=1.25,
                duration_seconds=3.5,
            ),
            {
                "asset_key": "manual:audio",
                "source_path": "audio/reference.wav",
                "start_seconds": 1.25,
                "duration_seconds": 3.5,
            },
        ),
    ],
)
@pytest.mark.asyncio
async def test_asset_operations_preserve_arguments_and_return_status(
    monkeypatch,
    tmp_path: Path,
    gateway_method: str,
    service_method: str,
    command: object,
    expected_fields: dict,
) -> None:
    from ai_anime.modules.production.infrastructure import seedance2_panel

    beat = {"beat_number": 3, "seedance2_config_json": "{}"}
    store = _Store([beat, {"beat_number": 4}])
    gateway, episode_source, prop_menu_source = _gateway(monkeypatch, store)
    context = _context(tmp_path)
    calls: list[dict] = []
    status_response = {"ok": True, "data": {"beat_number": 3}}

    async def operation(**kwargs):
        calls.append(kwargs)
        if service_method == "remove_seedance2_uploaded_asset":
            return True
        return Path(context.output_dir) / "result"

    monkeypatch.setattr(seedance2_panel.panel_service, service_method, operation)
    monkeypatch.setattr(
        gateway,
        "_status_response",
        lambda _session: status_response,
    )

    result = await getattr(gateway, gateway_method)(context, command)

    expected = {
        "store": store,
        "episode": 2,
        "beat": beat,
        **expected_fields,
    }
    if service_method != "remove_seedance2_uploaded_asset":
        expected["project_dir"] = Path(context.output_dir)
    assert calls == [expected]
    assert result == status_response
    assert episode_source.calls == [(store, 2)]
    assert prop_menu_source.calls == [
        (store, "episode", [beat, {"beat_number": 4}])
    ]
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_operation_exception_still_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import seedance2_panel

    store = _Store([{"beat_number": 3}])
    gateway, _episode_source, _prop_menu_source = _gateway(monkeypatch, store)

    async def fail(**_kwargs):
        raise RuntimeError("operation failed")

    monkeypatch.setattr(
        seedance2_panel.panel_service,
        "save_seedance2_uploaded_asset",
        fail,
    )

    with pytest.raises(RuntimeError, match="operation failed"):
        await gateway.upload(
            _context(tmp_path),
            UploadSeedance2AssetCommand(
                project="demo",
                episode_num=2,
                beat_num=3,
                filename="reference.png",
                content=b"image",
                content_type="image/png",
            ),
        )

    assert store.close_calls == 1
