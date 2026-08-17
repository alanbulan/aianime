import pytest

from ai_anime.modules.ai_assistant.public import ChatScope


@pytest.mark.parametrize("payload", [None, {}, {"kind": ""}])
def test_chat_scope_defaults_to_home(payload):
    scope = ChatScope.from_payload(payload)

    assert scope == ChatScope(kind="home")
    assert scope.to_dict() == {
        "kind": "home",
        "id": None,
        "conversationId": "main",
    }


def test_home_scope_discards_payload_id():
    assert ChatScope.from_payload({"kind": "home", "id": "ignored"}) == ChatScope(
        kind="home"
    )


def test_project_conversations_normalize_id():
    assert ChatScope.from_payload(
        {"kind": "project", "id": "  item-1  "}
    ).to_dict() == {
        "kind": "project",
        "id": "item-1",
        "conversationId": "main",
    }


def test_chat_scope_normalizes_conversation_id():
    scope = ChatScope.from_payload(
        {"kind": "project", "id": "item-1", "conversationId": "chat_2"}
    )

    assert scope.conversation_id == "chat_2"


def test_chat_scope_rejects_invalid_conversation_id():
    with pytest.raises(ValueError, match="invalid conversation id"):
        ChatScope.from_payload(
            {"kind": "project", "id": "item-1", "conversationId": "../bad"}
        )


def test_unknown_scope_is_rejected():
    with pytest.raises(ValueError, match="unsupported chat scope: unknown"):
        ChatScope.from_payload({"kind": "unknown"})


def test_project_scope_requires_id():
    with pytest.raises(ValueError, match="scope id is required for project"):
        ChatScope.from_payload({"kind": "project", "id": "  "})


@pytest.mark.parametrize("kind", ["asset", "task"])
def test_non_interactive_scope_is_rejected_from_payload(kind):
    with pytest.raises(ValueError, match=f"unsupported chat scope: {kind}"):
        ChatScope.from_payload({"kind": kind, "id": "item-1"})
