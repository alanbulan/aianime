from ai_anime.modules.asset_world.application.prop_models import NovelProp


def test_novel_prop_defaults_and_serialization() -> None:
    prop = NovelProp(name="七星剑")

    assert prop.model_dump() == {
        "name": "七星剑",
        "aliases": [],
        "prop_type": "object",
        "visual_prompt": "",
        "description": "",
        "owner": "",
        "notes": "",
        "updated_at": "",
    }


def test_novel_prop_alias_lists_are_isolated() -> None:
    first = NovelProp(name="七星剑")
    second = NovelProp(name="玉佩")

    first.aliases.append("宝剑")

    assert first.aliases == ["宝剑"]
    assert second.aliases == []
