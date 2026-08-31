import json
import struct
from pathlib import Path

import pytest


pytestmark = pytest.mark.m09


def _write_png(path: Path, *, width: int = 512, height: int = 768) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    header = b"\x89PNG\r\n\x1a\n"
    ihdr = b"IHDR" + struct.pack(">II", width, height) + b"\x08\x02\x00\x00\x00"
    path.write_bytes(header + struct.pack(">I", len(ihdr) - 4) + ihdr)


def test_drama_narration_panel_sends_audio_only_when_prompt_references_it(
    tmp_path, monkeypatch
):
    from ai_anime.modules.project_workspace.infrastructure import project_config as pc
    from ai_anime.modules.production.infrastructure.seedance2_panel_service import build_seedance2_video_panel_state

    monkeypatch.setattr(pc, "STATE_DIR", tmp_path / "state")
    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    scene = project_dir / "assets" / "scenes" / "旧书店" / "master.png"
    narrator_audio = project_dir / "assets" / "narrator" / "voice.mp3"
    uploaded_audio = (
        project_dir / "seedance2_uploads" / "ep001" / "beat_01" / "audios" / "custom.wav"
    )
    for image_path in (frame, scene):
        _write_png(image_path)
    narrator_audio.parent.mkdir(parents=True, exist_ok=True)
    narrator_audio.write_bytes(b"project narrator")
    uploaded_audio.parent.mkdir(parents=True, exist_ok=True)
    uploaded_audio.write_bytes(b"user uploaded audio")
    pc.update_project_config_file(
        "alice",
        "project",
        lambda config: config.update({"spine_template": "drama"}),
    )
    pc.set_narrator_reference_audio(
        "alice",
        "project",
        relative_path="assets/narrator/voice.mp3",
        sha256="sha",
        updated_at="2026-05-29T00:00:00+00:00",
    )

    state = build_seedance2_video_panel_state(
        project_dir=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "narration",
            "scene_ref": {"scene_id": "旧书店"},
            "narration_segment": "画外音响起。",
            "seedance2_config_json": json.dumps(
                {"reference_audio_paths": [str(uploaded_audio)]}
            ),
        },
    )

    selected_audio = [
        asset for asset in state.assets if asset.media_type == "audio" and asset.selected
    ]
    audio_assets = [asset for asset in state.assets if asset.media_type == "audio"]
    assert selected_audio == []
    assert [(asset.reference_label, asset.path) for asset in audio_assets] == [
        ("音频1", narrator_audio),
        ("音频2", uploaded_audio),
    ]

    state = build_seedance2_video_panel_state(
        project_dir=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "narration",
            "scene_ref": {"scene_id": "旧书店"},
            "narration_segment": "画外音响起。",
            "seedance2_config_json": json.dumps(
                {
                    "final_prompt": "参考@音频2声线。",
                    "reference_audio_paths": [str(uploaded_audio)],
                }
            ),
        },
    )

    selected_audio = [
        asset for asset in state.assets if asset.media_type == "audio" and asset.selected
    ]
    assert [asset.path for asset in selected_audio] == [uploaded_audio]
    assert selected_audio[0].key.startswith("user_audio:")


def test_sync_asset_paths_preserves_unreferenced_uploaded_audio(tmp_path, monkeypatch):
    from ai_anime.modules.production.application.seedance2_config import (
        Seedance2VideoConfig,
    )
    from ai_anime.modules.production.infrastructure import seedance2_panel_service

    uploaded_audio = tmp_path / "custom.wav"
    uploaded_audio.write_bytes(b"user uploaded audio")
    config = Seedance2VideoConfig(reference_audio_paths=[str(uploaded_audio)])
    monkeypatch.setattr(
        seedance2_panel_service,
        "build_seedance2_project_assets",
        lambda **_kwargs: [],
    )

    seedance2_panel_service._sync_seedance2_asset_paths(
        config=config,
        project_dir=tmp_path,
        episode=1,
        beat={"beat_number": 1, "audio_type": "narration"},
    )

    assert config.reference_audio_paths == [str(uploaded_audio)]


@pytest.mark.asyncio
async def test_prompt_regeneration_does_not_reuse_generated_output_as_manual_reference(
    tmp_path, monkeypatch
):
    from ai_anime.modules.production.application.seedance2_config import (
        dump_seedance2_config,
        parse_seedance2_config,
    )
    from ai_anime.modules.production.infrastructure import seedance2_panel_service

    captured: dict[str, object] = {}

    class _Store:
        async def update_beat_asset(self, **kwargs):
            captured["saved_json"] = kwargs["seedance2_config_json"]

    async def composer(**kwargs):
        captured["manual_prompt_reference"] = kwargs["manual_prompt_reference"]
        return "镜头缓慢推近白石夏音，她轻声说出：“你听到了？”。"

    monkeypatch.setattr(
        seedance2_panel_service,
        "build_seedance2_project_assets",
        lambda **_kwargs: [],
    )
    beat = {
        "beat_number": 8,
        "visual_description": "白石夏音站在音乐教室内。",
        "narration_segment": "你听到了？",
        "audio_type": "dialogue",
        "seedance2_config_json": dump_seedance2_config(
            {
                "final_prompt": "использовать参考@音频1作为角色声线。",
                "prompt_source": "generated",
            }
        ),
    }

    await seedance2_panel_service.generate_seedance2_prompt_for_panel(
        store=_Store(),
        episode=1,
        beat=beat,
        project_dir=tmp_path,
        manual_prompt_reference="использовать参考@音频1作为角色声线。",
        composer=composer,
    )

    assert captured["manual_prompt_reference"] == ""
    saved = parse_seedance2_config(captured["saved_json"])
    assert "использовать" not in saved.final_prompt
    assert saved.prompt_source == "generated"
    assert "白石夏音" in saved.prompt_validation_source
    assert "использовать" not in saved.prompt_validation_source


@pytest.mark.asyncio
async def test_prompt_generation_persists_manual_reference_for_later_validation(
    tmp_path, monkeypatch
):
    from ai_anime.modules.production.application.seedance2_config import (
        parse_seedance2_config,
    )
    from ai_anime.modules.production.infrastructure import seedance2_panel_service

    captured: dict[str, str] = {}

    class _Store:
        async def update_beat_asset(self, **kwargs):
            captured["saved_json"] = kwargs["seedance2_config_json"]

    async def composer(**_kwargs):
        return "角色面对镜头说出俄语台词：“Привет”。"

    monkeypatch.setattr(
        seedance2_panel_service,
        "build_seedance2_project_assets",
        lambda **_kwargs: [],
    )

    await seedance2_panel_service.generate_seedance2_prompt_for_panel(
        store=_Store(),
        episode=1,
        beat={
            "beat_number": 1,
            "visual_description": "角色面对镜头。",
        },
        project_dir=tmp_path,
        manual_prompt_reference="保留俄语台词 Привет",
        composer=composer,
    )

    saved = parse_seedance2_config(captured["saved_json"])
    assert "Привет" in saved.final_prompt
    assert "Привет" in saved.prompt_validation_source
