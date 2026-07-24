from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from ai_anime.modules.production.infrastructure import generation_context
from ai_anime.modules.production.infrastructure.generation_context import (
    AssetWorldCharacterProjector,
)


def test_character_projection_preserves_generation_fields_and_paths(
    tmp_path: Path,
) -> None:
    project_dir = tmp_path / "demo"
    portrait = project_dir / "assets" / "characters" / "林昭" / "portrait.png"
    identity_reference = (
        project_dir
        / "assets"
        / "characters"
        / "林昭"
        / "identities"
        / "青年.png"
    )
    for path in (portrait, identity_reference):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()

    identity = SimpleNamespace(
        identity_id="林昭_青年",
        identity_name="青年",
        appearance_details="青衣短打",
        face_prompt="clear eyes",
        body_type="slender",
        fish_voice_id="voice-1",
        age_group="youth",
        portrait_image="portrait-source.png",
        costume_image="costume-source.png",
        character_tag="[LinZ]",
        source="extracted",
    )
    character = SimpleNamespace(
        name="林昭",
        gender="male",
        body_type="tall",
        role="主角",
        is_main=True,
        face_prompt="sharp eyes",
        appearance_details="默认青衣",
        identities=[identity],
    )

    projected = AssetWorldCharacterProjector(tmp_path).project_characters(
        [character],
        "demo",
    )

    assert projected == [
        {
            "name": "林昭",
            "gender": "male",
            "body_type": "tall",
            "role": "主角",
            "is_main": True,
            "portrait_path": str(portrait),
            "face_prompt": "sharp eyes",
            "appearance_details": "默认青衣",
            "identities": [
                {
                    "identity_id": "林昭_青年",
                    "identity_name": "青年",
                    "appearance_details": "青衣短打",
                    "face_prompt": "clear eyes",
                    "body_type": "slender",
                    "fish_voice_id": "voice-1",
                    "age_group": "youth",
                    "portrait_image": "portrait-source.png",
                    "costume_image": "costume-source.png",
                    "primary_reference": str(identity_reference),
                    "character_tag": "[LinZ]",
                    "source": "extracted",
                }
            ],
        }
    ]


def test_character_map_delegates_to_asset_world_public_api(
    tmp_path: Path,
    monkeypatch,
) -> None:
    captured: dict = {}

    def build_character_map_for_grid(**kwargs):
        captured.update(kwargs)
        return {"林昭": {"ref_path": "portrait.png"}}

    monkeypatch.setattr(
        generation_context,
        "build_character_map_for_grid",
        build_character_map_for_grid,
    )
    beats = [{"beat_number": 1}]
    characters = [{"name": "林昭"}]

    result = AssetWorldCharacterProjector(tmp_path).build_character_map(
        beats=beats,
        characters=characters,
        project="demo",
        sketch_colors={"林昭_青年": "#3366FF"},
        use_detected_identities=True,
    )

    assert result == {"林昭": {"ref_path": "portrait.png"}}
    assert captured == {
        "grid_beats": beats,
        "characters": characters,
        "user_output_dir": tmp_path,
        "project": "demo",
        "sketch_colors": {"林昭_青年": "#3366FF"},
        "use_detected_identities": True,
    }
