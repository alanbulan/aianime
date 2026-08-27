import pytest

from ai_anime.modules.narrative_planning.public import NovelEpisode
from ai_anime.modules.task_execution.public import selection_scope


def test_selection_scope_is_order_sensitive():
    assert selection_scope("2x2_2-3_sketch", [1, 41, 2]) != selection_scope(
        "2x2_2-3_sketch",
        [1, 2, 41],
    )


def test_manual_shot_order_helpers_keep_inserted_beat_between_neighbors():
    from ai_anime.modules.narrative_planning.domain import sort_beats_for_display

    beats = [
        {"beat_number": 1, "shot_order": 10},
        {"beat_number": 2, "shot_order": 20},
        {"beat_number": 41, "shot_order": 15, "is_manual_shot": True},
    ]

    assert [beat["beat_number"] for beat in sort_beats_for_display(beats)] == [1, 41, 2]


def test_manual_shot_insert_order_uses_integer_slots():
    from ai_anime.modules.narrative_planning.domain import calculate_insert_order

    assert calculate_insert_order(None, 10) == 5
    assert calculate_insert_order(None, 2) == 1
    assert calculate_insert_order(None, 1) is None
    assert calculate_insert_order(10, 20) == 15
    assert calculate_insert_order(10, 15) == 12
    assert calculate_insert_order(10, 12) == 11
    assert calculate_insert_order(10, 11) is None


def test_manual_shot_duration_prefers_user_duration_over_audio():
    from ai_anime.modules.narrative_planning.public import resolve_target_video_duration

    beat = {"beat_number": 41, "duration_seconds": 3.0, "is_manual_shot": True}

    assert resolve_target_video_duration(beat, audio_duration=7.5) == 3.0


def test_manual_shot_segments_only_include_missing_manual_sketches(tmp_path):
    from ai_anime.modules.narrative_planning.public import missing_manual_shot_segments

    def _scene(scene_id):
        return {"scene_id": scene_id}

    beats = [
        {"beat_number": 1, "shot_order": 10, "scene_ref": _scene("地下室")},
        {"beat_number": 41, "shot_order": 15, "is_manual_shot": True, "scene_ref": _scene("地下室")},
        {"beat_number": 44, "shot_order": 17, "is_manual_shot": True, "scene_ref": _scene("镇口")},
        {"beat_number": 42, "shot_order": 18, "is_manual_shot": True, "scene_ref": _scene("地下室")},
        {"beat_number": 2, "shot_order": 20, "scene_ref": _scene("地下室")},
        {"beat_number": 3, "shot_order": 30, "scene_ref": _scene("镇口")},
        {"beat_number": 43, "shot_order": 35, "is_manual_shot": True, "scene_ref": _scene("镇口")},
        {"beat_number": 4, "shot_order": 40, "scene_ref": _scene("镇口")},
    ]
    (tmp_path / "beat_42.png").write_bytes(b"existing")

    segments = missing_manual_shot_segments(beats, tmp_path)

    assert segments == [[41], [44], [43]]


def test_storyboard_manual_sketch_beats_exclude_manual_space_maps():
    from ai_anime.modules.narrative_planning.public import (
        storyboard_beats_for_manual_sketches,
    )

    beats = [
        {"beat_number": 1, "visual_description": "普通镜头"},
        {
            "beat_number": 41,
            "is_manual_shot": True,
            "visual_description": "[space_map] 二楼平面图",
        },
        {
            "beat_number": 42,
            "is_manual_shot": True,
            "visual_description": "手工补一个表情",
        },
    ]

    assert [beat["beat_number"] for beat in storyboard_beats_for_manual_sketches(beats)] == [
        1,
        42,
    ]


def test_manual_sketch_mode_reuses_normal_sketch_grid_split():
    from ai_anime.modules.production.infrastructure.media_generation.nanobanana_grid import (
        sketch_scene_grid_split as sketch_location_grid_split,
    )
    from ai_anime.modules.narrative_planning.public import choose_manual_sketch_mode_key

    for count in range(1, 9):
        beats = [
            {"beat_number": idx, "visual_description": f"手工镜头 {idx}"}
            for idx in range(1, count + 1)
        ]

        assert choose_manual_sketch_mode_key(count) == sketch_location_grid_split(beats)[0][
            "mode_key"
        ]


def test_single_sketch_plan_preserves_storyboard_order_across_repeated_scenes():
    from ai_anime.modules.production.infrastructure.media_generation.nanobanana_grid import (
        sketch_scene_grid_split,
    )

    beats = [
        {"beat_number": 1, "scene_ref": {"scene_id": "A"}},
        {"beat_number": 2, "scene_ref": {"scene_id": "B"}},
        {"beat_number": 3, "scene_ref": {"scene_id": "A"}},
    ]

    plan = sketch_scene_grid_split(beats)

    assert [entry["beat_numbers"] for entry in plan] == [[1], [2], [3]]
    assert [(entry["rows"], entry["cols"]) for entry in plan] == [
        (1, 1),
        (1, 1),
        (1, 1),
    ]


@pytest.mark.asyncio
async def test_sqlite_manual_shot_fields_roundtrip_and_sort(tmp_path):
    from ai_anime.modules.narrative_planning.public import NovelVisualBeat
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])

    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="A",
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="B",
            ),
            NovelVisualBeat(
                beat_number=41,
                episode_number=1,
                narration="",
                visual_description="手工补一个眼神特写",
                shot_order=15,
                duration_seconds=3.0,
                is_manual_shot=True,
            ),
        ]
    )

    beats = await store.get_beats_as_dicts(1)

    assert [beat["beat_number"] for beat in beats] == [1, 41, 2]
    manual = beats[1]
    assert manual["narration_segment"] == ""
    assert manual["shot_order"] == 15
    assert manual["duration_seconds"] == 3.0
    assert manual["is_manual_shot"] is True


@pytest.mark.asyncio
async def test_insert_manual_shot_derives_identities_from_own_visual_description(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        insert_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="王大爷刹车",
                visual_description="{{王大爷_镇民时期}}扶着三轮车",
                detected_identities_json='["王大爷_镇民时期"]',
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="医院消息传来",
                visual_description="病房内气氛压抑",
            ),
        ]
    )

    await insert_manual_shot(
        store,
        episode_number=1,
        after_beat_number=1,
        visual_description="{{陆辰_书店老板时期}}低头看向机械表",
    )

    beats = await store.get_beats_as_dicts(1)
    manual = beats[1]

    assert manual["detected_identities"] == ["陆辰_书店老板时期"]


@pytest.mark.asyncio
async def test_insert_manual_shot_persists_explicit_detected_props(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        insert_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="{{陆辰_青年}}站在仓库里",
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="仓库门关闭",
            ),
        ]
    )

    new_beat = await insert_manual_shot(
        store,
        episode_number=1,
        after_beat_number=1,
        visual_description="{{陆辰_青年}}拿起[[玉佩]]",
        detected_props=["玉佩", "录音笔"],
    )

    assert new_beat["detected_props"] == ["玉佩", "录音笔"]


@pytest.mark.asyncio
async def test_insert_manual_shot_derives_props_from_visual_description_markers(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        insert_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="桌上放着[[录音笔]]",
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="灯光熄灭",
            ),
        ]
    )

    new_beat = await insert_manual_shot(
        store,
        episode_number=1,
        after_beat_number=1,
        visual_description="空镜头扫过[[录音笔]]和[[玉佩]]，再回到[[录音笔]]",
    )

    assert new_beat["detected_props"] == ["录音笔", "玉佩"]


@pytest.mark.asyncio
async def test_insert_manual_shot_accepts_scene_ref_and_optional_narration(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        insert_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="A",
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="B",
            ),
        ]
    )

    await insert_manual_shot(
        store,
        episode_number=1,
        after_beat_number=1,
        visual_description="补一个插入镜头",
        scene_ref={"scene_id": "兰州拉面馆_夜晚"},
        audio_type="narration",
        narration_segment="插入镜头旁白",
    )

    beats = await store.get_beats_as_dicts(1)
    manual = beats[1]

    assert manual["narration_segment"] == "插入镜头旁白"
    assert manual["scene_ref"]["scene_id"] == "兰州拉面馆_夜晚"


@pytest.mark.asyncio
async def test_insert_manual_shot_persists_audio_type_and_speaker(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        insert_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="A",
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="B",
            ),
        ]
    )

    await insert_manual_shot(
        store,
        episode_number=1,
        after_beat_number=1,
        visual_description="谢铮抬眼开口",
        audio_type="dialogue",
        speaker="谢铮_青年时期",
        narration_segment="走。",
    )

    beats = await store.get_beats_as_dicts(1)
    manual = beats[1]

    assert manual["is_manual_shot"] is True
    assert manual["audio_type"] == "dialogue"
    assert manual["speaker"] == "谢铮_青年时期"
    assert manual["narration_segment"] == "走。"


@pytest.mark.asyncio
async def test_insert_manual_shot_accepts_dialogue_without_speaker(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        insert_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="A",
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="B",
            ),
        ]
    )

    await insert_manual_shot(
        store,
        episode_number=1,
        after_beat_number=1,
        visual_description="陆辰在仓库门口回头",
        audio_type="dialogue",
        speaker=None,
        narration_segment="别回头。",
    )

    beats = await store.get_beats_as_dicts(1)
    manual = beats[1]

    assert manual["is_manual_shot"] is True
    assert manual["audio_type"] == "dialogue"
    assert manual["speaker"] == ""
    assert manual["narration_segment"] == "别回头。"


@pytest.mark.asyncio
async def test_insert_manual_shot_at_front_allocates_order_before_first_beat(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        insert_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="A",
                shot_order=10,
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="B",
                shot_order=20,
            ),
        ]
    )

    new_beat = await insert_manual_shot(
        store,
        episode_number=1,
        after_beat_number=None,
        visual_description="片头补一个环境空镜",
        duration_seconds=3.0,
    )
    beats = await store.get_beats_as_dicts(1)

    assert new_beat["shot_order"] == 5
    assert [beat["beat_number"] for beat in beats] == [3, 1, 2]


@pytest.mark.asyncio
async def test_insert_manual_shot_does_not_reuse_existing_asset_number(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        insert_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    (project_dir / "sketches" / "ep001").mkdir(parents=True)
    (project_dir / "sketches" / "ep001" / "beat_03.png").write_bytes(b"stale")
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="A",
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="B",
            ),
        ]
    )

    new_beat = await insert_manual_shot(
        store,
        episode_number=1,
        after_beat_number=1,
        visual_description="补一个镜头",
        duration_seconds=3.0,
    )

    assert new_beat["beat_number"] == 4


@pytest.mark.asyncio
async def test_delete_manual_shot_removes_only_manual_beat(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        delete_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="A",
                shot_order=10,
            ),
            NovelVisualBeat(
                beat_number=41,
                episode_number=1,
                narration="",
                visual_description="手工补一个镜头",
                shot_order=15,
                duration_seconds=3.0,
                is_manual_shot=True,
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="B",
                shot_order=20,
            ),
        ]
    )

    removed_paths = [
        project_dir / "sketches" / "ep001" / "beat_41.png",
        project_dir / "frames" / "ep001" / "beat_41.png",
        project_dir / "renders" / "ep001" / "beat_41.png",
        project_dir / "grids" / "ep001" / "sketch" / "cells" / "beat_41_a.png",
        project_dir / "grids" / "ep001" / "render" / "cells" / "beat_41_b.png",
    ]
    retained_path = (
        project_dir / "grids" / "ep001" / "sketch" / "cells" / "beat_42_a.png"
    )
    for path in [*removed_paths, retained_path]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"asset")

    refreshed = await delete_manual_shot(store, episode_number=1, beat_number=41)

    assert [beat["beat_number"] for beat in refreshed] == [1, 2]
    assert [beat["beat_number"] for beat in await store.get_beats_as_dicts(1)] == [1, 2]
    assert all(not path.exists() for path in removed_paths)
    assert retained_path.exists()


@pytest.mark.asyncio
async def test_delete_manual_shot_rejects_normal_beat(tmp_path):
    from ai_anime.modules.narrative_planning.public import (
        NovelVisualBeat,
        delete_manual_shot,
    )
    from ai_anime.sqlite_store import SQLiteStore

    project_dir = tmp_path / "user" / "project"
    project_dir.mkdir(parents=True)
    store = SQLiteStore("user/project", output_dir=str(project_dir), state_dir=str(project_dir))
    await store._ensure_db()
    await store.add_episodes([NovelEpisode(number=1, title="第一集")])
    await store.add_visual_beats(
        [
            NovelVisualBeat(
                beat_number=1,
                episode_number=1,
                narration="第一句",
                visual_description="A",
                shot_order=10,
            ),
            NovelVisualBeat(
                beat_number=2,
                episode_number=1,
                narration="第二句",
                visual_description="B",
                shot_order=20,
            ),
        ]
    )

    with pytest.raises(ValueError, match="Only manual shots"):
        await delete_manual_shot(store, episode_number=1, beat_number=1)

    assert [beat["beat_number"] for beat in await store.get_beats_as_dicts(1)] == [1, 2]


def test_sketch_prompt_treats_manual_panels_as_normal_visual_descriptions():
    from ai_anime.modules.production.infrastructure.media_generation.prompt_builder import (
        GridConfig,
        PromptComponents,
        PromptContext,
        PromptMode,
        SketchModeStrategy,
        StyleConfig,
    )

    ctx = PromptContext(
        grid=GridConfig(rows=1, cols=2, aspect_ratio="4:3"),
        characters={},
        style=StyleConfig(style_keywords="test", avoid_keywords=""),
        beats=[
            {"beat_number": 1, "visual_description": "普通画面"},
            {
                "beat_number": 41,
                "visual_description": "手工补眼神",
                "is_manual_shot": True,
            },
        ],
        mode=PromptMode.SKETCH,
    )

    prompt = SketchModeStrategy().build(ctx, PromptComponents())

    assert "- **Panel 1**: 普通画面" in prompt
    assert "- **Panel 2**: 手工补眼神" in prompt
    assert "MANDATORY SHOT DIRECTIVE" not in prompt
