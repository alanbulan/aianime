import pytest

from ai_anime.modules.ai_assistant.public import ChatScope


@pytest.mark.parametrize("payload", [None, {}, {"kind": ""}])
def test_chat_scope_defaults_to_home(payload):
    scope = ChatScope.from_payload(payload)

    assert scope == ChatScope(kind="home")
    assert scope.to_dict() == {"kind": "home", "id": None}


def test_home_scope_discards_payload_id():
    assert ChatScope.from_payload({"kind": "home", "id": "ignored"}) == ChatScope(
        kind="home"
    )


@pytest.mark.parametrize("kind", ["project", "asset", "task"])
def test_scoped_conversations_normalize_id(kind):
    assert ChatScope.from_payload({"kind": kind, "id": "  item-1  "}).to_dict() == {
        "kind": kind,
        "id": "item-1",
    }


def test_unknown_scope_is_rejected():
    with pytest.raises(ValueError, match="unsupported chat scope: unknown"):
        ChatScope.from_payload({"kind": "unknown"})


@pytest.mark.parametrize("kind", ["project", "asset", "task"])
def test_non_home_scope_requires_id(kind):
    with pytest.raises(ValueError, match=f"scope id is required for {kind}"):
        ChatScope.from_payload({"kind": kind, "id": "  "})
