"""Agent prompt context assembly."""

from typing import Any

from ai_anime.modules.ai_assistant.application.ports import UserPreferences
from ai_anime.modules.ai_assistant.domain import compose_agent_prompt


class AgentPromptContext:
    def __init__(self, preferences: UserPreferences) -> None:
        self._preferences = preferences

    def build(
        self,
        username: str,
        project: str,
        prompt: str,
        *,
        context_messages: list[dict[str, Any]] | None = None,
        rebuild_context: bool = False,
        current_turn_id: str | None = None,
    ) -> str:
        return compose_agent_prompt(
            username=username,
            project=project,
            prompt=prompt,
            preferences=self._preferences.load(username),
            context_messages=context_messages,
            rebuild_context=rebuild_context,
            current_turn_id=current_turn_id,
        )
