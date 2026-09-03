from __future__ import annotations

import json
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.video_reference_panel import (
    CropVideoReferenceAssetCommand,
    RemoveVideoReferenceAssetCommand,
    VideoReferencePanelBeatMissing,
    VideoReferencePanelQuery,
    TrimVideoReferenceAudioAssetCommand,
    UploadVideoReferenceAssetCommand,
)
from ai_anime.modules.production.infrastructure.video_reference_panel import (
    LocalVideoReferencePanelGateway,
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
    from ai_anime.modules.production.infrastructure import video_reference_panel

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        video_reference_panel.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    episode_source = _EpisodeSource()
    prop_menu_source = _PropMenuSource()
    return (
        LocalVideoReferencePanelGateway(episode_source, prop_menu_source),
        episode_source,
        prop_menu_source,
    )


@pytest.mark.asyncio
async def test_status_projects_panel_state_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import video_reference_panel
    from ai_anime.shared.utils.path_resolver import PathResolver

    context = _context(tmp_path)
    beat = {
        "beat_number": 3,
        "audio_type": "silence",
        "video_config_json": "{}",
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
    event_loop_thread = threading.get_ident()

    def build_panel_state(**_kwargs):
        assert threading.get_ident() != event_loop_thread
        return state

    monkeypatch.setattr(
        video_reference_panel.video_reference_panel_service,
        "build_video_reference_panel_state",
        build_panel_state,
    )

    response = await gateway.status(
        context,
        VideoReferencePanelQuery(project="demo", episode_num=2, beat_num=3),
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
        "invalid": 0,
        "unused": 0,
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
                "required": True,
                "state": "sent",
                "reference_label": "图片1",
                "note": "",
                "status_detail": "",
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
async def test_status_resolves_narrator_config_by_project_name_for_id_request(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import video_reference_panel
    from ai_anime.modules.project_workspace.infrastructure import project_config
    from ai_anime.shared.utils import project_paths

    context = _context(tmp_path)
    monkeypatch.setattr(project_config, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(project_paths, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(project_paths, "OUTPUT_DIR", tmp_path / "output")
    monkeypatch.setattr(project_paths, "RUNTIME_DIR", tmp_path / "runtime")
    context.state_dir.mkdir(parents=True)
    (context.state_dir / "project_config.json").write_text(
        json.dumps({"narrator_reference_audio_path": "assets/narrator/voice.wav"}),
        encoding="utf-8",
    )
    voice_path = context.output_dir / "assets" / "narrator" / "voice.wav"
    voice_path.parent.mkdir(parents=True)
    voice_path.write_bytes(b"existing narrator voice")
    beat = {"beat_number": 3, "audio_type": "narration", "video_config_json": "{}"}
    store = _Store([beat])
    store.project_dir = context.output_dir
    gateway, _, _ = _gateway(monkeypatch, store)
    monkeypatch.setattr(
        video_reference_panel.video_reference_panel_service,
        "build_video_reference_panel_state",
        lambda **_kwargs: SimpleNamespace(
            assets=[],
            final_prompt="existing prompt",
            prompt_source="fallback",
            prompt_status="ready",
            prompt_guidance="",
            text_overlay={},
            prompt_inputs_hash="",
            current_prompt_inputs_hash="",
        ),
    )

    response = await gateway.status(
        context,
        VideoReferencePanelQuery(
            project=context.project_id,
            episode_num=2,
            beat_num=3,
        ),
    )

    assert response["data"]["voice"]["ready"] is True
    assert response["data"]["voice"]["label"] == "声线就绪"
    assert response["data"]["voice"]["detail"] == str(voice_path)
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_status_distinguishes_invalid_voice_from_missing_asset(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import video_reference_panel

    context = _context(tmp_path)
    beat = {
        "beat_number": 3,
        "audio_type": "dialogue",
        "speaker": "白石夏音_学生时期",
        "video_config_json": "{}",
    }
    store = _Store([beat])
    gateway, _episode_source, _prop_menu_source = _gateway(monkeypatch, store)
    voice_path = (
        Path(context.output_dir)
        / "assets"
        / "characters"
        / "白石夏音"
        / "voices"
        / "voice_youth.wav"
    )
    voice_path.parent.mkdir(parents=True, exist_ok=True)
    voice_path.write_bytes(b"voice")
    validation_error = "参考声线只有 1.04 秒，当前视频工作流要求至少 1.8 秒。"
    voice_asset = SimpleNamespace(
        key="voice:白石夏音_学生时期",
        label="白石夏音 · 学生时期声线",
        media_type="audio",
        selected=False,
        exists=True,
        required=True,
        reference_label="未发送",
        note="视频对白参考声线",
        validation_error=validation_error,
        fallback_text="",
        identity_id="",
        prop_id="",
        prop_scope="",
        path=voice_path,
        crop_source_path=None,
    )
    state = SimpleNamespace(
        assets=[voice_asset],
        final_prompt="@音频1 保持角色声线",
        prompt_source="generated",
        prompt_status="ready",
        prompt_guidance="",
        text_overlay={},
        prompt_inputs_hash="same",
        current_prompt_inputs_hash="same",
    )
    monkeypatch.setattr(
        video_reference_panel.video_reference_panel_service,
        "build_video_reference_panel_state",
        lambda **_kwargs: state,
    )
    monkeypatch.setattr(
        video_reference_panel,
        "dialogue_voice_reference_rows",
        lambda *_args, **_kwargs: [
            SimpleNamespace(
                display_name="白石夏音",
                speaker="白石夏音_学生时期",
                status=SimpleNamespace(active_reference_path=voice_path),
            )
        ],
    )

    response = await gateway.status(
        context,
        VideoReferencePanelQuery(project="demo", episode_num=2, beat_num=3),
    )

    data = response["data"]
    assert data["voice"] == {
        "required": True,
        "ready": False,
        "label": "声线不合规",
        "detail": f"白石夏音 · 学生时期声线：{validation_error}",
        "speaker": "白石夏音_学生时期",
    }
    assert data["assets"]["missing"] == 0
    assert data["assets"]["invalid"] == 1
    assert data["assets"]["unused"] == 0
    item = data["assets"]["items"][0]
    assert item["state"] == "invalid"
    assert item["status_detail"] == validation_error
    assert item["exists"] is True
    assert item["reference_label"] == "未发送"
    assert store.close_calls == 1


@pytest.mark.parametrize(
    ("asset_key", "asset_label"),
    [
        ("voice:narrator", "项目解说声线"),
        ("voice:陆辰_青年时期", "陆辰 · 青年时期声线"),
    ],
    ids=["third-person", "first-person"],
)
def test_voice_status_reports_invalid_narration_reference(
    monkeypatch,
    tmp_path: Path,
    asset_key: str,
    asset_label: str,
) -> None:
    from ai_anime.modules.production.infrastructure import video_reference_panel

    monkeypatch.setattr(
        video_reference_panel,
        "resolve_narrator_reference_status",
        lambda **_kwargs: SimpleNamespace(
            active_reference_path=tmp_path / "voice.mp3",
            detail="",
            error="",
        ),
    )
    validation_error = "参考声线只有 1.04 秒，当前视频工作流要求至少 1.8 秒。"

    result = video_reference_panel._voice_status_payload(
        beat={"audio_type": "narration"},
        characters=[],
        username="alice",
        project="demo",
        store=object(),
        output_dir=tmp_path,
        assets=[
            SimpleNamespace(
                key=asset_key,
                label=asset_label,
                validation_error=validation_error,
            )
        ],
    )

    assert result == {
        "required": True,
        "ready": False,
        "label": "声线不合规",
        "detail": f"{asset_label}：{validation_error}",
        "speaker": "NARRATOR",
    }


@pytest.mark.asyncio
async def test_missing_beat_closes_store(monkeypatch, tmp_path: Path) -> None:
    store = _Store([{"beat_number": 1}])
    gateway, episode_source, prop_menu_source = _gateway(monkeypatch, store)

    with pytest.raises(VideoReferencePanelBeatMissing, match="Beat 9 not found"):
        await gateway.status(
            _context(tmp_path),
            VideoReferencePanelQuery(project="demo", episode_num=2, beat_num=9),
        )

    assert store.close_calls == 1
    assert episode_source.calls == []
    assert prop_menu_source.calls == []


@pytest.mark.parametrize(
    ("gateway_method", "service_method", "command", "expected_fields"),
    [
        (
            "upload",
            "save_video_reference_uploaded_asset",
            UploadVideoReferenceAssetCommand(
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
            "remove_video_reference_uploaded_asset",
            RemoveVideoReferenceAssetCommand(
                project="demo",
                episode_num=2,
                beat_num=3,
                media_kind="images",
                path="video_reference_uploads/reference.png",
            ),
            {
                "media_kind": "images",
                "path": "video_reference_uploads/reference.png",
            },
        ),
        (
            "crop",
            "crop_video_reference_asset",
            CropVideoReferenceAssetCommand(
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
            "trim_video_reference_audio",
            TrimVideoReferenceAudioAssetCommand(
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
    from ai_anime.modules.production.infrastructure import video_reference_panel

    beat = {"beat_number": 3, "video_config_json": "{}"}
    store = _Store([beat, {"beat_number": 4}])
    gateway, episode_source, prop_menu_source = _gateway(monkeypatch, store)
    context = _context(tmp_path)
    calls: list[dict] = []
    status_response = {"ok": True, "data": {"beat_number": 3}}

    async def operation(**kwargs):
        calls.append(kwargs)
        if service_method == "remove_video_reference_uploaded_asset":
            return True
        return Path(context.output_dir) / "result"

    monkeypatch.setattr(
        video_reference_panel.video_reference_panel_service,
        service_method,
        operation,
    )
    async def status(_session):
        return status_response

    monkeypatch.setattr(gateway, "_status_response", status)

    result = await getattr(gateway, gateway_method)(context, command)

    expected = {
        "store": store,
        "episode": 2,
        "beat": beat,
        **expected_fields,
    }
    if service_method != "remove_video_reference_uploaded_asset":
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
    from ai_anime.modules.production.infrastructure import video_reference_panel

    store = _Store([{"beat_number": 3}])
    gateway, _episode_source, _prop_menu_source = _gateway(monkeypatch, store)

    async def fail(**_kwargs):
        raise RuntimeError("operation failed")

    monkeypatch.setattr(
        video_reference_panel.video_reference_panel_service,
        "save_video_reference_uploaded_asset",
        fail,
    )

    with pytest.raises(RuntimeError, match="operation failed"):
        await gateway.upload(
            _context(tmp_path),
            UploadVideoReferenceAssetCommand(
                project="demo",
                episode_num=2,
                beat_num=3,
                filename="reference.png",
                content=b"image",
                content_type="image/png",
            ),
        )

    assert store.close_calls == 1
