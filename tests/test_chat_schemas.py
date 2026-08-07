import pytest
from pydantic import ValidationError

from ai_anime.api.chat_schemas import (
    ChatAttachmentIn,
    ChatMessageIn,
    ChatScopePayload,
    attachment_payloads,
    to_chat_scope,
)


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (None, {"kind": "home", "id": None}),
        (ChatScopePayload(), {"kind": "home", "id": None}),
        (
            ChatScopePayload(kind="project", id="project-a"),
            {"kind": "project", "id": "project-a"},
        ),
    ],
)
def test_chat_scope_payload_maps_to_domain_scope(payload, expected):
    assert to_chat_scope(payload).to_dict() == expected


@pytest.mark.parametrize("kind", ["asset", "task", "unknown"])
def test_chat_scope_payload_rejects_non_interactive_kinds(kind):
    with pytest.raises(ValidationError):
        ChatScopePayload(kind=kind, id="item-1")


def test_attachment_payloads_preserve_present_values_and_field_names():
    result = attachment_payloads(
        [
            ChatAttachmentIn(
                id="attachment-1",
                mimeType="text/plain",
                fileName="notes.txt",
                fileSize=0,
                content="",
            )
        ]
    )

    assert result == [
        {
            "id": "attachment-1",
            "mimeType": "text/plain",
            "fileName": "notes.txt",
            "fileSize": 0,
            "content": "",
        }
    ]


def test_attachment_payloads_skip_fully_empty_items():
    assert attachment_payloads([ChatAttachmentIn()]) == []


def test_chat_message_defaults_remain_empty_and_unscoped():
    message = ChatMessageIn(type="chat.message", text="hello")

    assert message.scope is None
    assert message.turn_id is None
    assert message.attachments == []
