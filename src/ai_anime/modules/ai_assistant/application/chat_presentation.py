"""Chat presentation application service."""

from typing import Any

from ai_anime.modules.ai_assistant.application.ports import JsonRenderErrors
from ai_anime.modules.ai_assistant.domain.chat_presentation import (
    append_tool_ui_specs,
    extract_tool_ui_specs,
    normalize_json_render_reply,
)


class ChatPresentation:
    def __init__(self, errors: JsonRenderErrors) -> None:
        self._errors = errors

    def normalize_reply(self, content: str) -> str:
        return normalize_json_render_reply(
            content,
            report_error=self._errors.record,
        )

    def extract_tool_ui_specs(self, value: Any) -> list[dict[str, Any]]:
        return extract_tool_ui_specs(
            value,
            report_error=self._errors.record,
        )

    def append_tool_ui_specs(
        self,
        content: str,
        specs: list[dict[str, Any]],
    ) -> str:
        return append_tool_ui_specs(
            content,
            specs,
            report_error=self._errors.record,
        )
