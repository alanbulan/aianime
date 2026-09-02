from types import SimpleNamespace

from ai_anime.modules.narrative_planning.public import inspect_episode_scene_plan


def _episode(scene_ids: list[str]):
    return SimpleNamespace(
        beat_source_text="""
## 1-1 场景：【内 公司办公区 夜】
△办公室灯光闪烁。
## 1-2 场景：【内 会议室 夜】
△众人沉默。
# 1-3 场景：【内 电梯 夜】
△电梯下行。
# 1-4 场景：【内 公司机房 夜】
△服务器停机。
""",
        adapted_content="",
        raw_content="",
        scene_menu=[
            SimpleNamespace(scene_id=value, base_scene_id="") for value in scene_ids
        ],
    )


def test_scene_plan_rejects_nonempty_but_partial_menu() -> None:
    readiness = inspect_episode_scene_plan(
        _episode(["公司一楼大厅"]),
        [SimpleNamespace(name="公司一楼大厅", aliases=["大厅"])],
    )

    assert readiness.complete is False
    assert readiness.missing_locations == (
        "公司办公区",
        "会议室",
        "电梯",
        "公司机房",
    )


def test_scene_plan_accepts_canonical_scene_aliases() -> None:
    scenes = [
        SimpleNamespace(name="公司办公区", aliases=["办公区"]),
        SimpleNamespace(name="公司会议室", aliases=["会议室"]),
        SimpleNamespace(name="公司电梯轿厢", aliases=["电梯", "公司电梯"]),
        SimpleNamespace(name="公司机房", aliases=["机房"]),
    ]
    readiness = inspect_episode_scene_plan(
        _episode([scene.name for scene in scenes]),
        scenes,
    )

    assert readiness.complete is True
    assert readiness.missing_locations == ()
