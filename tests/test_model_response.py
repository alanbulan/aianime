from __future__ import annotations

import json

import pytest

from ai_anime.shared.model_response import (
    parse_model_json_object_response,
    parse_model_json_response,
    strip_model_response_code_fence,
)


def test_strip_model_response_code_fence_preserves_unfenced_text() -> None:
    assert strip_model_response_code_fence("  plain text  ") == "plain text"
    assert (
        strip_model_response_code_fence('```text\n{"label":"雨伞"}\n```')
        == '{"label":"雨伞"}'
    )


def test_parse_model_json_response_accepts_fences_and_surrounding_prose() -> None:
    assert parse_model_json_response('```json\n[{"shot": 1}]\n```') == [{"shot": 1}]
    assert parse_model_json_response('结果如下：{"outer":{"value":1}}。') == {
        "outer": {"value": 1}
    }


def test_parse_model_json_object_response_rejects_non_object_values() -> None:
    with pytest.raises(ValueError, match="response is not a JSON object"):
        parse_model_json_object_response("[]")
    with pytest.raises(json.JSONDecodeError):
        parse_model_json_object_response("not json")
