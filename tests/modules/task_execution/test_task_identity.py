from ai_anime.modules.task_execution.public import (
    actor_name_for_project_task,
    actor_name_for_task,
    cancel_key,
    project_task_scope_from_key,
    project_task_state_key,
    selection_scope,
    task_config_scope,
    task_scope_from_key,
    task_state_key,
)


def test_task_state_keys_preserve_legacy_and_project_shapes() -> None:
    assert task_state_key(
        "single_video",
        "alice",
        "demo",
        2,
        beat_num=3,
        scope="preview",
    ) == "task:single_video:alice:demo:2:3:preview"
    assert project_task_state_key(
        "single_video",
        "project-1",
        2,
        beat_num=3,
        scope="preview",
    ) == "task:single_video:project:project-1:2:3:preview"


def test_task_scope_parsing_uses_the_matching_identity_prefix() -> None:
    assert task_scope_from_key(
        "task:selected_regen:alice:demo:4:range-a",
        task_type="selected_regen",
        username="alice",
        project="demo",
        episode=4,
    ) == "range-a"
    assert project_task_scope_from_key(
        "task:selected_regen:project:project-1:4:range-a",
        task_type="selected_regen",
        project_id="project-1",
        episode=4,
    ) == "range-a"


def test_actor_names_preserve_registered_and_fallback_shapes() -> None:
    assert actor_name_for_task(
        "single_video",
        "alice",
        "demo",
        episode=2,
        beat_num=3,
    ) == "single_video_alice_demo_2_3"
    assert actor_name_for_project_task(
        "custom_task",
        "project-1",
        episode=2,
        scope="draft",
    ) == "custom_task_project_project-1_2_draft"


def test_selection_and_config_scopes_are_stable() -> None:
    assert selection_scope("selected", [3, 1, 3, 2]) == selection_scope(
        "selected",
        [3, 1, 2],
    )
    assert task_config_scope("render", {"b": 2, "a": 1}) == task_config_scope(
        "render",
        {"a": 1, "b": 2},
    )


def test_cancel_key_remains_scoped_to_one_task_run() -> None:
    assert cancel_key(
        project_id="project-1",
        task_type="single_video",
        episode=2,
        beat_num=3,
        scope="preview",
        task_id="task-1",
    ) == "task:cancel:project-1:single_video:2:3:preview:task-1"
