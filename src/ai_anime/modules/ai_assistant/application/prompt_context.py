"""Agent prompt context assembly."""

from ai_anime.modules.ai_assistant.application.ports import UserPreferences
from ai_anime.modules.ai_assistant.domain import compose_agent_prompt


class AgentPromptContext:
    def __init__(self, preferences: UserPreferences) -> None:
        self._preferences = preferences

    def build(self, username: str, project: str, prompt: str) -> str:
        return compose_agent_prompt(
            username=username,
            project=project,
            prompt=prompt,
            preferences=self._preferences.load(username),
        )
