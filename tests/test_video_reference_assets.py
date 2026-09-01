import struct
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.public import CharacterIdentity, NovelCharacter
from ai_anime.modules.production.application.video_config import VideoReferenceMode


pytestmark = pytest.mark.m09


def _write_png(path: Path, *, width: int = 512, height: int = 768) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    header = b"\x89PNG\r\n\x1a\n"
    ihdr = b"IHDR" + struct.pack(">II", width, height) + b"\x08\x02\x00\x00\x00"
    path.write_bytes(header + struct.pack(">I", len(ihdr) - 4) + ihdr)


def test_multimodal_assets_use_scene_ref_identity_and_audio(tmp_path, monkeypatch):
    from ai_anime.modules.project_workspace.infrastructure import project_config as pc
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    monkeypatch.setattr(pc, "STATE_DIR", tmp_path / "state")
    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    identity = project_dir / "assets" / "characters" / "秦" / "identities" / "青年.png"
    scene = project_dir / "assets" / "scenes" / "客厅_夜" / "master.png"
    audio = project_dir / "assets" / "narrator" / "voice.mp3"
    for image_path in (frame, identity, scene):
        _write_png(image_path)
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"audio")
    pc.set_narrator_reference_audio(
        "alice",
        "project",
        relative_path="assets/narrator/voice.mp3",
        sha256="sha",
        updated_at="2026-05-14T00:00:00+00:00",
    )

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "detected_identities": ["秦_青年"],
            "scene_ref": {"scene_id": "客厅_夜"},
            "location": "旧场景字段不应优先",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_images") == [
        str(frame),
        str(identity),
        str(scene),
    ]
    assert selected_reference_paths(assets, "reference_audios") == [str(audio)]
    scene_asset = next(asset for asset in assets if asset.key == "scene:客厅_夜")
    assert scene_asset.path == scene
    assert scene_asset.selected is True


def test_multimodal_assets_use_semantic_frame_anchors_with_other_references(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    first = project_dir / "frames" / "ep001" / "beat_01.png"
    last = project_dir / "frames" / "ep001" / "beat_02.png"
    identity = project_dir / "assets" / "characters" / "秦" / "identities" / "青年.png"
    scene = project_dir / "assets" / "scenes" / "教室" / "master.png"
    for image_path in (first, last, identity, scene):
        _write_png(image_path)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "detected_identities": ["秦_青年"],
            "scene_ref": {"scene_id": "教室"},
        },
        next_beat={"beat_number": 2},
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_images") == [
        str(first),
        str(last),
        str(identity),
        str(scene),
    ]
    by_key = {asset.key: asset for asset in assets}
    assert by_key["first_frame"].reference_label == "图片1"
    assert by_key["last_frame"].reference_label == "图片2"
    assert by_key["last_frame"].request_field == "reference_images"
    assert selected_reference_paths(assets, "last_frame_image") == []


def test_multimodal_assets_limit_reference_images_to_official_maximum(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    first = project_dir / "frames" / "ep001" / "beat_01.png"
    last = project_dir / "frames" / "ep001" / "beat_02.png"
    _write_png(first)
    _write_png(last)
    identities = [f"角色{index}_默认" for index in range(10)]
    for identity_id in identities:
        character, identity = identity_id.split("_", 1)
        _write_png(
            project_dir
            / "assets"
            / "characters"
            / character
            / "identities"
            / f"{identity}.png"
        )

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={"beat_number": 1, "detected_identities": identities},
        next_beat={"beat_number": 2},
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    selected = selected_reference_paths(assets, "reference_images")
    assert len(selected) == 9
    assert [
        asset.reference_label
        for asset in assets
        if asset.selected and asset.request_field == "reference_images"
    ] == [f"图片{index}" for index in range(1, 10)]
    overflow = [asset for asset in assets if "超过单次最多 9 张" in asset.note]
    assert len(overflow) == 3
    assert all(asset.selected is False for asset in overflow)


def test_multimodal_assets_resolve_scene_variant_to_derived_scene_master(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    base_scene = project_dir / "assets" / "scenes" / "客厅" / "master.png"
    derived_scene = project_dir / "assets" / "scenes" / "客厅_漏水" / "master.png"
    for image_path in (frame, base_scene, derived_scene):
        _write_png(image_path)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "scene_ref": {"scene_id": "客厅", "variant_id": "漏水"},
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_images") == [
        str(frame),
        str(derived_scene),
    ]
    scene_asset = next(asset for asset in assets if asset.key.startswith("scene:"))
    assert scene_asset.key == "scene:客厅_漏水"
    assert scene_asset.label == "场景锚点 · 客厅_漏水"


def test_multimodal_assets_resolve_time_of_day_to_time_plate(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    base_scene = project_dir / "assets" / "scenes" / "客厅" / "master.png"
    night_scene = project_dir / "assets" / "scenes" / "客厅_夜" / "master.png"
    for image_path in (frame, base_scene, night_scene):
        _write_png(image_path)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "scene_ref": {"scene_id": "客厅"},
            "time_of_day": "夜晚",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_images") == [
        str(frame),
        str(night_scene),
    ]
    scene_asset = next(asset for asset in assets if asset.key.startswith("scene:"))
    assert scene_asset.key == "scene:客厅_夜"
    assert scene_asset.label == "场景锚点 · 客厅_夜"


def test_multimodal_assets_resolve_variant_time_to_variant_time_plate(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    base_scene = project_dir / "assets" / "scenes" / "客厅" / "master.png"
    base_night_scene = project_dir / "assets" / "scenes" / "客厅_夜" / "master.png"
    variant_scene = project_dir / "assets" / "scenes" / "客厅_漏水" / "master.png"
    variant_night_scene = (
        project_dir / "assets" / "scenes" / "客厅_漏水_夜" / "master.png"
    )
    for image_path in (
        frame,
        base_scene,
        base_night_scene,
        variant_scene,
        variant_night_scene,
    ):
        _write_png(image_path)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "scene_ref": {"scene_id": "客厅", "variant_id": "漏水"},
            "time_of_day": "夜晚",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_images") == [
        str(frame),
        str(variant_night_scene),
    ]
    scene_asset = next(asset for asset in assets if asset.key.startswith("scene:"))
    assert scene_asset.key == "scene:客厅_漏水_夜"
    assert scene_asset.label == "场景锚点 · 客厅_漏水_夜"


def test_multimodal_assets_fall_back_to_base_scene_master_when_variant_image_missing(
    tmp_path,
):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    base_scene = project_dir / "assets" / "scenes" / "客厅" / "master.png"
    derived_scene_dir = project_dir / "assets" / "scenes" / "客厅_漏水"
    derived_scene_dir.mkdir(parents=True)
    for image_path in (frame, base_scene):
        _write_png(image_path)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "scene_ref": {"scene_id": "客厅", "variant_id": "漏水"},
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_images") == [
        str(frame),
        str(base_scene),
    ]
    scene_asset = next(asset for asset in assets if asset.key.startswith("scene:"))
    assert scene_asset.key == "scene:客厅"
    assert scene_asset.label == "场景锚点 · 客厅"
    assert scene_asset.path == base_scene


async def test_prepare_video_reference_generation_inputs_preserves_config_duration(
    tmp_path,
):
    from ai_anime.modules.production.application.video_config import dump_video_config
    from ai_anime.modules.production.infrastructure.video_reference_pipeline import (
        prepare_video_reference_generation_inputs,
    )

    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    _write_png(frame)

    prepared = await prepare_video_reference_generation_inputs(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "video_config_json": dump_video_config(
                {
                    "mode": VideoReferenceMode.FIRST_FRAME.value,
                    "duration": 8,
                    "final_prompt": "参考图片1生成视频。",
                }
            ),
        },
        video_mode="first_frame",
        prompt="old prompt",
        duration=4,
        resolution=None,
        ratio=None,
    )

    assert prepared.duration == 8
    assert '"duration":8' in prepared.video_config_json


async def test_prepare_video_reference_generation_rejects_contaminated_generated_prompt(
    tmp_path,
):
    from ai_anime.modules.production.application.video_config import (
        dump_video_config,
    )
    from ai_anime.modules.production.infrastructure.video_reference_pipeline import (
        prepare_video_reference_generation_inputs,
    )

    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_08.png"
    _write_png(frame)

    with pytest.raises(ValueError, match="西里尔文字"):
        await prepare_video_reference_generation_inputs(
            project_output=project_dir,
            episode=1,
            beat={
                "beat_number": 8,
                "visual_description": "白石夏音站在音乐教室内。",
                "narration_segment": "你听到了？",
                "audio_type": "dialogue",
                "video_config_json": dump_video_config(
                    {
                        "mode": VideoReferenceMode.FIRST_FRAME.value,
                        "final_prompt": (
                            "她说出：“你听到了？”。использовать参考@音频1作为角色声线。"
                        ),
                        "prompt_source": "generated",
                        "prompt_validation_source": "镜头草稿不含外语。",
                    }
                ),
            },
            video_mode="first_frame",
            prompt="unused",
            duration=4,
            resolution="720p",
            ratio="9:16",
        )


@pytest.mark.parametrize(
    ("final_prompt", "error_pattern"),
    [
        ("镜头缓慢推近。использовать", "西里尔文字"),
        ("镜头缓慢推近。_leaked", "异常尾部片段"),
    ],
)
async def test_prepare_video_reference_generation_strictly_checks_legacy_generated_prompt(
    tmp_path,
    final_prompt,
    error_pattern,
):
    from ai_anime.modules.production.application.video_config import (
        dump_video_config,
    )
    from ai_anime.modules.production.infrastructure.video_reference_pipeline import (
        prepare_video_reference_generation_inputs,
    )

    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_08.png"
    _write_png(frame)

    with pytest.raises(ValueError, match=error_pattern):
        await prepare_video_reference_generation_inputs(
            project_output=project_dir,
            episode=1,
            beat={
                "beat_number": 8,
                "video_config_json": dump_video_config(
                    {
                        "mode": VideoReferenceMode.FIRST_FRAME.value,
                        "final_prompt": final_prompt,
                        "prompt_source": "generated",
                    }
                ),
            },
            video_mode="first_frame",
            prompt="unused",
            duration=4,
            resolution="720p",
            ratio="9:16",
        )


async def test_prepare_video_reference_generation_accepts_generated_prompt_with_persisted_source(
    tmp_path,
):
    from ai_anime.modules.production.application.video_config import (
        dump_video_config,
    )
    from ai_anime.modules.production.infrastructure.video_reference_pipeline import (
        prepare_video_reference_generation_inputs,
    )

    project_dir = tmp_path / "output" / "alice" / "project"
    frame = project_dir / "frames" / "ep001" / "beat_08.png"
    _write_png(frame)
    final_prompt = "角色面对镜头说出俄语台词：“Привет”。"

    prepared = await prepare_video_reference_generation_inputs(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 8,
            "visual_description": "角色面对镜头。",
            "video_config_json": dump_video_config(
                {
                    "mode": VideoReferenceMode.FIRST_FRAME.value,
                    "final_prompt": final_prompt,
                    "prompt_source": "generated",
                    "prompt_validation_source": "原始草稿包含俄语台词 Привет。",
                }
            ),
        },
        video_mode="first_frame",
        prompt="unused",
        duration=4,
        resolution="720p",
        ratio="9:16",
    )

    assert prepared.prompt == final_prompt


async def test_prepare_multimodal_inputs_adds_semantic_frame_guidance(tmp_path):
    from ai_anime.modules.production.application.video_config import (
        dump_video_config,
        parse_video_config,
    )
    from ai_anime.modules.production.infrastructure.video_reference_pipeline import (
        prepare_video_reference_generation_inputs,
    )

    project_dir = tmp_path / "project"
    first = project_dir / "frames" / "ep001" / "beat_01.png"
    last = project_dir / "frames" / "ep001" / "beat_02.png"
    identity = project_dir / "assets" / "characters" / "秦" / "identities" / "青年.png"
    scene = project_dir / "assets" / "scenes" / "教室" / "master.png"
    for image_path in (first, last, identity, scene):
        _write_png(image_path)

    prepared = await prepare_video_reference_generation_inputs(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "detected_identities": ["秦_青年"],
            "scene_ref": {"scene_id": "教室"},
            "video_config_json": dump_video_config(
                {
                    "mode": VideoReferenceMode.MULTIMODAL_REFERENCE.value,
                    "final_prompt": "人物从教室门口走向窗边。",
                }
            ),
        },
        next_beat={"beat_number": 2},
        video_mode="first_frame",
        prompt="unused",
        duration=6,
        resolution="720p",
        ratio="9:16",
    )

    assert prepared.image_path is None
    assert prepared.last_frame_path is None
    assert [reference.path for reference in prepared.references] == [
        str(first),
        str(last),
        str(identity),
        str(scene),
    ]
    assert prepared.prompt.startswith("图片1作为视频起始画面，图片2作为视频结束画面")
    assert "其余图片与音频仅作为身份、环境、道具和声线参考" in prepared.prompt
    assert (
        parse_video_config(prepared.video_config_json).final_prompt
        == "人物从教室门口走向窗边。"
    )


def test_multimodal_assets_merge_detected_identities_with_visual_markers(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
    )

    project_dir = tmp_path / "project"
    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 29,
            "visual_description": "{{沈月白_青年时期}}紧紧盯着{{陆辰_青年时期}}。",
            "detected_identities": ["沈月白_青年时期"],
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    identity_keys = [asset.key for asset in assets if asset.key.startswith("identity:")]
    assert identity_keys == [
        "identity:沈月白_青年时期",
        "identity:陆辰_青年时期",
    ]


def test_multimodal_dialogue_assets_use_character_voice_reference_not_beat_audio(
    tmp_path,
):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    identity_image = (
        project_dir
        / "assets"
        / "characters"
        / "面馆男青年"
        / "identities"
        / "青年时期.png"
    )
    scene = project_dir / "assets" / "scenes" / "兰州拉面馆" / "master.png"
    voice = (
        project_dir
        / "assets"
        / "characters"
        / "面馆男青年"
        / "voices"
        / "voice_default.mp3"
    )
    stale_beat_audio = project_dir / "audio" / "ep001" / "beat_01.mp3"
    for image_path in (frame, identity_image, scene):
        _write_png(image_path)
    voice.parent.mkdir(parents=True)
    voice.write_bytes(b"voice")
    stale_beat_audio.parent.mkdir(parents=True)
    stale_beat_audio.write_bytes(b"stale generated beat audio")
    character = NovelCharacter(
        name="面馆男青年",
        reference_audio_path="assets/characters/面馆男青年/voices/voice_default.mp3",
    )
    character.identities = [
        CharacterIdentity(
            identity_id="面馆男青年_青年时期",
            character_name="面馆男青年",
            identity_name="青年时期",
        )
    ]

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "dialogue",
            "speaker": "面馆男青年_青年时期",
            "detected_identities": ["面馆男青年_青年时期"],
            "scene_ref": {"scene_id": "兰州拉面馆"},
            "narration_segment": "面馆男青年（神色诧异）：现在啥事儿没有啊？",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        characters=[character],
    )

    assert selected_reference_paths(assets, "reference_audios") == [str(voice)]
    audio_asset = next(asset for asset in assets if asset.media_type == "audio")
    assert audio_asset.key == "voice:面馆男青年_青年时期"
    assert audio_asset.identity_id == "面馆男青年_青年时期"
    assert audio_asset.label == "面馆男青年 · 青年时期声线"


def test_multimodal_dialogue_assets_follow_multi_speaker_text_order(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    _write_png(project_dir / "frames" / "ep001" / "beat_01.png")
    _write_png(project_dir / "assets" / "scenes" / "兰州拉面馆" / "master.png")
    man_voice = (
        project_dir
        / "assets"
        / "characters"
        / "面馆男青年"
        / "voices"
        / "voice_default.mp3"
    )
    woman_voice = (
        project_dir
        / "assets"
        / "characters"
        / "面馆女青年"
        / "voices"
        / "voice_default.mp3"
    )
    for path in (man_voice, woman_voice):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(path.name.encode())
    man = NovelCharacter(
        name="面馆男青年",
        reference_audio_path="assets/characters/面馆男青年/voices/voice_default.mp3",
    )
    woman = NovelCharacter(
        name="面馆女青年",
        reference_audio_path="assets/characters/面馆女青年/voices/voice_default.mp3",
    )

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "dialogue",
            "scene_ref": {"scene_id": "兰州拉面馆"},
            "narration_segment": (
                "面馆男青年（打开易拉罐）：现在啥事儿没有啊？"
                "面馆女青年（抬头）：你知道杜晨吗？"
            ),
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        characters=[woman, man],
    )

    assert selected_reference_paths(assets, "reference_audios") == [
        str(man_voice),
        str(woman_voice),
    ]


def test_multimodal_narration_assets_use_project_narrator_voice_not_beat_audio(
    tmp_path, monkeypatch
):
    from ai_anime.modules.project_workspace.infrastructure import project_config as pc
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    monkeypatch.setattr(pc, "STATE_DIR", tmp_path / "state")
    project_dir = tmp_path / "output" / "alice" / "project"
    _write_png(project_dir / "frames" / "ep001" / "beat_01.png")
    _write_png(project_dir / "assets" / "scenes" / "兰州拉面馆" / "master.png")
    narrator_voice = project_dir / "assets" / "narrator" / "voice.mp3"
    narrator_voice.parent.mkdir(parents=True, exist_ok=True)
    narrator_voice.write_bytes(b"narrator voice")
    stale_beat_audio = project_dir / "audio" / "ep001" / "beat_01.mp3"
    stale_beat_audio.parent.mkdir(parents=True)
    stale_beat_audio.write_bytes(b"stale generated beat audio")
    pc.set_narrator_reference_audio(
        "alice",
        "project",
        relative_path="assets/narrator/voice.mp3",
        sha256="sha",
        updated_at="2026-05-14T00:00:00+00:00",
    )

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "narration",
            "scene_ref": {"scene_id": "兰州拉面馆"},
            "narration_segment": "夜色里的面馆还亮着灯。",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_audios") == [str(narrator_voice)]
    audio_asset = next(asset for asset in assets if asset.media_type == "audio")
    assert audio_asset.key == "voice:narrator"
    assert audio_asset.identity_id == "__narrator__"
    assert audio_asset.label == "项目解说声线"


def test_multimodal_narration_keeps_project_narrator_mentionable_when_duration_needs_trim(
    tmp_path, monkeypatch
):
    from ai_anime.modules.project_workspace.infrastructure import project_config as pc
    from ai_anime.modules.production.infrastructure import (
        video_reference_assets as asset_mod,
    )
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    monkeypatch.setattr(pc, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(
        asset_mod, "probe_voice_sample_duration_seconds", lambda _path: 12.0
    )
    project_dir = tmp_path / "output" / "alice" / "project"
    _write_png(project_dir / "frames" / "ep001" / "beat_01.png")
    narrator_voice = project_dir / "assets" / "narrator" / "voice.mp3"
    narrator_voice.parent.mkdir(parents=True, exist_ok=True)
    narrator_voice.write_bytes(b"narrator voice")
    pc.set_narrator_reference_audio(
        "alice",
        "project",
        relative_path="assets/narrator/voice.mp3",
        sha256="sha",
        updated_at="2026-05-14T00:00:00+00:00",
    )

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "narration",
            "narration_segment": "夜色里的面馆还亮着灯。",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_audios") == [str(narrator_voice)]
    audio_asset = next(asset for asset in assets if asset.key == "voice:narrator")
    assert audio_asset.selected is True
    assert audio_asset.reference_label == "音频1"
    assert audio_asset.validation_error == ""
    assert "建议裁剪到 3-5 秒" in audio_asset.note


def test_multimodal_reference_rejects_audio_below_workflow_hard_minimum(
    tmp_path, monkeypatch
):
    from ai_anime.modules.project_workspace.infrastructure import project_config as pc
    from ai_anime.modules.production.infrastructure import (
        video_reference_assets as asset_mod,
    )
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
    )

    monkeypatch.setattr(pc, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(
        asset_mod,
        "probe_voice_sample_duration_seconds",
        lambda _path: 1.04,
    )
    project_dir = tmp_path / "output" / "alice" / "project"
    _write_png(project_dir / "frames" / "ep001" / "beat_01.png")
    narrator_voice = project_dir / "assets" / "narrator" / "voice.mp3"
    narrator_voice.parent.mkdir(parents=True, exist_ok=True)
    narrator_voice.write_bytes(b"short narrator voice")
    pc.set_narrator_reference_audio(
        "alice",
        "project",
        relative_path="assets/narrator/voice.mp3",
        sha256="sha",
        updated_at="2026-08-27T00:00:00+00:00",
    )

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "narration",
            "narration_segment": "故事开始。",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    audio_asset = next(asset for asset in assets if asset.key == "voice:narrator")
    assert audio_asset.selected is False
    assert "至少 1.8 秒" in audio_asset.validation_error


def test_user_ref2va_assets_accept_official_six_three_three_shape(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        append_user_video_reference_assets,
        apply_prompt_audio_selection,
        selected_reference_paths,
    )

    images = [tmp_path / f"image-{index}.png" for index in range(6)]
    videos = [tmp_path / f"video-{index}.mp4" for index in range(3)]
    audios = [tmp_path / f"audio-{index}.wav" for index in range(3)]
    for path in images:
        _write_png(path)
    for path in [*videos, *audios]:
        path.write_bytes(b"media")

    assets = []
    append_user_video_reference_assets(
        assets,
        reference_image_paths=[str(path) for path in images],
        reference_video_paths=[str(path) for path in videos],
        reference_audio_paths=[str(path) for path in audios],
    )
    assets = apply_prompt_audio_selection(assets, "音频1 音频2 音频3")

    assert len(selected_reference_paths(assets, "reference_images")) == 6
    assert len(selected_reference_paths(assets, "reference_videos")) == 3
    assert len(selected_reference_paths(assets, "reference_audios")) == 3
    assert sum(asset.selected for asset in assets) == 12


def test_user_ref2va_assets_expose_overflow_instead_of_slicing(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        append_user_video_reference_assets,
        apply_prompt_audio_selection,
        selected_reference_paths,
    )

    images = [tmp_path / f"image-{index}.png" for index in range(7)]
    videos = [tmp_path / f"video-{index}.mp4" for index in range(3)]
    audios = [tmp_path / f"audio-{index}.wav" for index in range(3)]
    for path in images:
        _write_png(path)
    for path in [*videos, *audios]:
        path.write_bytes(b"media")

    assets = []
    append_user_video_reference_assets(
        assets,
        reference_image_paths=[str(path) for path in images],
        reference_video_paths=[str(path) for path in videos],
        reference_audio_paths=[str(path) for path in audios],
    )
    assets = apply_prompt_audio_selection(assets, "音频1 音频2 音频3")

    assert len(selected_reference_paths(assets, "reference_images")) == 7
    assert len(selected_reference_paths(assets, "reference_videos")) == 3
    assert len(selected_reference_paths(assets, "reference_audios")) == 2
    overflow = next(asset for asset in assets if asset.path == audios[2])
    assert overflow.selected is False
    assert overflow.reference_label == "未发送"
    assert "12 个混合参考文件上限" in overflow.note


@pytest.mark.asyncio
async def test_uploaded_video_reference_persists_and_deletes_video_path(tmp_path):
    from ai_anime.modules.production.application.video_config import parse_video_config
    from ai_anime.modules.production.infrastructure.video_reference_panel_service import (
        remove_video_reference_uploaded_asset,
        save_video_reference_uploaded_asset,
    )

    class Store:
        async def update_beat_asset(self, **kwargs):
            self.saved_json = kwargs["video_config_json"]

    store = Store()
    beat = {"beat_number": 2, "video_config_json": "{}"}
    saved = await save_video_reference_uploaded_asset(
        store=store,
        episode=1,
        beat=beat,
        project_dir=tmp_path,
        filename="motion.mp4",
        content=b"video",
        content_type="video/mp4",
    )

    assert saved is not None
    assert saved.parent.name == "videos"
    assert parse_video_config(beat["video_config_json"]).reference_video_paths == [
        str(saved)
    ]

    removed = await remove_video_reference_uploaded_asset(
        store=store,
        episode=1,
        beat=beat,
        media_kind="videos",
        path=str(saved),
    )

    assert removed is True
    assert not saved.exists()
    assert parse_video_config(beat["video_config_json"]).reference_video_paths == []


def test_prompt_audio_selection_sends_only_referenced_audio(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        apply_prompt_audio_selection,
        append_user_video_reference_assets,
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    first_audio = project_dir / "assets" / "narrator" / "voice.mp3"
    second_audio = (
        project_dir
        / "video_reference_uploads"
        / "ep001"
        / "beat_01"
        / "audios"
        / "alt.wav"
    )
    first_audio.parent.mkdir(parents=True, exist_ok=True)
    second_audio.parent.mkdir(parents=True, exist_ok=True)
    first_audio.write_bytes(b"default narrator")
    second_audio.write_bytes(b"custom narrator")

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "narration",
            "narration_segment": "夜色里的面馆还亮着灯。",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )
    append_user_video_reference_assets(
        assets,
        reference_image_paths=[],
        reference_video_paths=[],
        reference_audio_paths=[str(second_audio)],
    )

    selected = apply_prompt_audio_selection(assets, "画面参考图片1，不使用音频。")
    assert selected_reference_paths(selected, "reference_audios") == []
    audio_assets = [asset for asset in selected if asset.media_type == "audio"]
    assert [asset.reference_label for asset in audio_assets] == ["音频1", "音频2"]

    selected = apply_prompt_audio_selection(assets, "参考@音频2声线生成。")
    assert selected_reference_paths(selected, "reference_audios") == [str(second_audio)]


def test_drama_narration_assets_ignore_first_person_protagonist_voice(
    tmp_path, monkeypatch
):
    from ai_anime.modules.project_workspace.infrastructure import project_config as pc
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    monkeypatch.setattr(pc, "STATE_DIR", tmp_path / "state")
    project_dir = tmp_path / "output" / "alice" / "project"
    _write_png(project_dir / "frames" / "ep001" / "beat_01.png")
    _write_png(project_dir / "assets" / "scenes" / "旧书店" / "master.png")
    protagonist_voice = (
        project_dir / "assets" / "characters" / "陆辰" / "voice_sample.wav"
    )
    protagonist_voice.parent.mkdir(parents=True, exist_ok=True)
    protagonist_voice.write_bytes(b"protagonist voice")
    narrator_voice = project_dir / "assets" / "narrator" / "voice.mp3"
    narrator_voice.parent.mkdir(parents=True, exist_ok=True)
    narrator_voice.write_bytes(b"project narrator voice")
    pc.update_project_config_file(
        "alice",
        "project",
        lambda config: config.update(
            {"spine_template": "drama", "narration_style": "first_person"}
        ),
    )
    pc.set_narrator_reference_audio(
        "alice",
        "project",
        relative_path="assets/narrator/voice.mp3",
        sha256="narrator-sha",
        updated_at="2026-05-29T00:00:00+00:00",
    )
    character = NovelCharacter(
        name="陆辰",
        is_main=True,
        reference_audio_path="assets/characters/陆辰/voice_sample.wav",
        reference_audio_sha256="protagonist-sha",
    )
    character.identities = [
        CharacterIdentity(
            identity_id="陆辰_青年时期",
            character_name="陆辰",
            identity_name="青年时期",
        )
    ]

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "narration",
            "scene_ref": {"scene_id": "旧书店"},
            "narration_segment": "画外音响起。",
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        characters=[character],
    )

    assert selected_reference_paths(assets, "reference_audios") == [str(narrator_voice)]
    audio_asset = next(asset for asset in assets if asset.media_type == "audio")
    assert audio_asset.key == "voice:narrator"
    assert audio_asset.identity_id == "__narrator__"
    assert audio_asset.label == "项目解说声线"


def test_multimodal_assets_skip_auto_audio_for_silence_beat(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    scene = project_dir / "assets" / "scenes" / "客厅_夜" / "master.png"
    audio = project_dir / "audio" / "ep001" / "beat_01.mp3"
    for image_path in (frame, scene):
        _write_png(image_path)
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"stale-audio")

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={
            "beat_number": 1,
            "audio_type": "silence",
            "scene_ref": {"scene_id": "客厅_夜"},
        },
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_images") == [
        str(frame),
        str(scene),
    ]
    assert selected_reference_paths(assets, "reference_audios") == []


def test_multimodal_assets_skip_auto_audio_for_legacy_action_beat(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    frame = project_dir / "frames" / "ep001" / "beat_01.png"
    audio = project_dir / "audio" / "ep001" / "beat_01.mp3"
    _write_png(frame)
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"stale-audio")

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={"beat_number": 1, "audio_type": "action"},
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
    )

    assert selected_reference_paths(assets, "reference_audios") == []


def test_first_frame_mode_only_sends_current_frame(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    frame = project_dir / "frames" / "ep001" / "beat_02.png"
    _write_png(frame)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={"beat_number": 2, "detected_identities": ["秦_青年"]},
        mode=VideoReferenceMode.FIRST_FRAME,
    )

    assert selected_reference_paths(assets, "image_url") == [str(frame)]
    assert selected_reference_paths(assets, "reference_images") == []
    assert selected_reference_paths(assets, "reference_audios") == []


def test_first_frame_for_video_uses_matching_video_input_override(tmp_path):
    from ai_anime.shared.utils.path_resolver import PathResolver

    project_dir = tmp_path / "project"
    paths = PathResolver(project_dir, 1)
    frame = paths.frame(2)
    override = paths.video_input_frame(2, slot="first_frame")
    _write_png(frame)
    _write_png(override, width=720, height=1280)
    paths.write_video_input_frame_meta(2, slot="first_frame", source_path=frame)

    assert paths.first_frame_for_video(2) == override

    frame.write_bytes(frame.read_bytes() + b"changed")
    assert paths.first_frame_for_video(2) == frame


def test_first_frame_mode_uses_matching_video_input_override(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    project_dir = tmp_path / "project"
    paths = PathResolver(project_dir, 1)
    frame = paths.frame(2)
    override = paths.video_input_frame(2, slot="first_frame")
    _write_png(frame)
    _write_png(override, width=720, height=1280)
    paths.write_video_input_frame_meta(2, slot="first_frame", source_path=frame)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={"beat_number": 2},
        mode=VideoReferenceMode.FIRST_FRAME,
    )

    assert selected_reference_paths(assets, "image_url") == [str(override)]
    first_asset = next(asset for asset in assets if asset.key == "first_frame")
    assert first_asset.crop_source_path == frame


def test_first_last_frame_mode_sends_both_frame_slots(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )

    project_dir = tmp_path / "project"
    first = project_dir / "frames" / "ep001" / "beat_02.png"
    last = project_dir / "frames" / "ep001" / "beat_03.png"
    _write_png(first)
    _write_png(last)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={"beat_number": 2},
        next_beat={"beat_number": 3},
        mode=VideoReferenceMode.FIRST_LAST_FRAME,
    )

    assert selected_reference_paths(assets, "first_frame_image") == [str(first)]
    assert selected_reference_paths(assets, "last_frame_image") == [str(last)]


def test_first_last_frame_mode_uses_matching_video_input_overrides(tmp_path):
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        build_video_reference_assets,
        selected_reference_paths,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    project_dir = tmp_path / "project"
    paths = PathResolver(project_dir, 1)
    first = paths.frame(2)
    last = paths.frame(3)
    first_override = paths.video_input_frame(2, slot="first_frame")
    last_override = paths.video_input_frame(2, slot="last_frame")
    _write_png(first)
    _write_png(last)
    _write_png(first_override, width=720, height=1280)
    _write_png(last_override, width=720, height=1280)
    paths.write_video_input_frame_meta(2, slot="first_frame", source_path=first)
    paths.write_video_input_frame_meta(2, slot="last_frame", source_path=last)

    assets = build_video_reference_assets(
        project_output=project_dir,
        episode=1,
        beat={"beat_number": 2},
        next_beat={"beat_number": 3},
        mode=VideoReferenceMode.FIRST_LAST_FRAME,
    )

    assert selected_reference_paths(assets, "first_frame_image") == [
        str(first_override)
    ]
    assert selected_reference_paths(assets, "last_frame_image") == [str(last_override)]
    by_key = {asset.key: asset for asset in assets}
    assert by_key["first_frame"].crop_source_path == first
    assert by_key["last_frame"].crop_source_path == last


async def test_crop_video_reference_asset_to_first_frame_writes_video_input_override(
    tmp_path,
    monkeypatch,
):
    from ai_anime.modules.production.infrastructure import (
        video_reference_panel_service as panel_service,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    project_dir = tmp_path / "project"
    paths = PathResolver(project_dir, 1)
    source = paths.frame(2)
    _write_png(source)

    async def fake_crop_image_to_path(_source, *, output_path, **_kwargs):
        _write_png(Path(output_path), width=720, height=1280)

    monkeypatch.setattr(panel_service, "crop_image_to_path", fake_crop_image_to_path)
    monkeypatch.setattr(
        panel_service, "validate_video_reference_image", lambda _path: ""
    )

    class Store:
        async def update_beat_asset(self, **_kwargs):
            raise AssertionError(
                "video input crops must not mutate reference_image_paths"
            )

    result = await panel_service.crop_video_reference_asset(
        store=Store(),
        episode=1,
        beat={"beat_number": 2},
        project_dir=project_dir,
        asset_key="first_frame",
        source_path=source,
        crop_data={
            "target": "first_frame",
            "x": 0,
            "y": 0,
            "width": 512,
            "height": 768,
        },
    )

    expected = paths.video_input_frame(2, slot="first_frame")
    assert result == expected
    assert (
        paths.valid_video_input_frame(2, slot="first_frame", source_path=source)
        == expected
    )
