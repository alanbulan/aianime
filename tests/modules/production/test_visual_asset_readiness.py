from types import SimpleNamespace

from ai_anime.modules.production.public import inspect_episode_visual_assets
from ai_anime.shared.utils.path_resolver import (
    canonical_identity_path,
    canonical_portrait_path,
    canonical_prop_reference_path,
    canonical_scene_master_path,
    canonical_scene_reverse_master_path,
)


def _fixture(tmp_path):
    identity = SimpleNamespace(
        identity_id="陈默_青年时期",
        identity_name="青年时期",
    )
    character = SimpleNamespace(
        name="陈默",
        identities=[identity],
    )
    scene = SimpleNamespace(name="公司办公区", aliases=["办公区"])
    prop = SimpleNamespace(name="故障工牌", aliases=["工牌"])
    episode = SimpleNamespace(
        identity_ids=[identity.identity_id],
        beat_source_text="## 1-1 场景：【内 公司办公区 夜】\n陈默：服务器停了。",
        adapted_content="",
        raw_content="",
        scene_menu=[SimpleNamespace(scene_id=scene.name, base_scene_id="")],
        prop_menu=[SimpleNamespace(prop_id=prop.name)],
    )
    beats = [
        {
            "beat_number": 1,
            "visual_description": "{{陈默_青年时期}}拿起[[故障工牌]]",
            "scene_ref": {"scene_id": scene.name},
        }
    ]
    for path in (
        canonical_portrait_path(tmp_path, character.name),
        canonical_identity_path(tmp_path, character.name, identity.identity_name),
        canonical_scene_master_path(tmp_path, scene.name),
        canonical_scene_reverse_master_path(tmp_path, scene.name),
        canonical_prop_reference_path(tmp_path, prop.name),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"asset")
    return episode, [character], [scene], [prop], beats


def test_visual_asset_readiness_requires_complete_episode_asset_closure(
    tmp_path,
) -> None:
    episode, characters, scenes, props, beats = _fixture(tmp_path)

    readiness = inspect_episode_visual_assets(
        project_dir=tmp_path,
        episode=episode,
        characters=characters,
        scenes=scenes,
        props=props,
        beats=beats,
        prop_plan_completed=True,
    )

    assert readiness.ready_for_sketches is True
    assert readiness.issues == ()


def test_visual_asset_readiness_blocks_missing_scene_image_and_prop_plan(
    tmp_path,
) -> None:
    episode, characters, scenes, props, beats = _fixture(tmp_path)
    canonical_scene_reverse_master_path(tmp_path, scenes[0].name).unlink()
    episode.prop_menu = []

    readiness = inspect_episode_visual_assets(
        project_dir=tmp_path,
        episode=episode,
        characters=characters,
        scenes=scenes,
        props=props,
        beats=beats,
        prop_plan_completed=False,
    )

    assert readiness.ready_for_sketches is False
    assert "场景反向图缺失：公司办公区" in readiness.issues
    assert "道具规划尚未完成" in readiness.issues
