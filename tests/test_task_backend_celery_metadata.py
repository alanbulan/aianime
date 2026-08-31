from ai_anime.modules.task_execution.domain.task_execution import (
    completion_metadata_with_provider_task_id,
    resource_refs_for_task_success,
)


def test_completion_metadata_carries_provider_task_id():
    metadata = completion_metadata_with_provider_task_id(
        {"celery_task_id": "celery-1"},
        {"provider_task_id": "194f3bde-d486-49c5-8785-a454d3e2fc13"},
    )

    assert metadata == {
        "celery_task_id": "celery-1",
        "provider_task_id": "194f3bde-d486-49c5-8785-a454d3e2fc13",
    }


def test_script_writer_resource_ref_is_episode_slot():
    refs = resource_refs_for_task_success(
        task_type="script_writer",
        episode=3,
        result={"beats": 18},
    )

    assert refs == ["ep003"]


def test_generation_resource_refs_use_beat_slots_from_result():
    refs = resource_refs_for_task_success(
        task_type="sketch_regen",
        episode=2,
        result={"updated_beats": [4, "5", 0, "bad", 4]},
    )

    assert refs == ["ep002:beat004", "ep002:beat005"]


def test_generation_resource_refs_keep_scope_for_dynamic_slots():
    refs = resource_refs_for_task_success(
        task_type="grid_regenerate",
        episode=1,
        beat_num=7,
        scope="character-grid",
        result={"updated_beats": [7]},
    )

    assert refs == ["ep001:beat007:character-grid"]
