"""Conversation title generation through the configured cloud/BYOK route."""

from __future__ import annotations

from ai_anime.modules.model_usage.public import (
    request_model_chat_content,
)


class ModelChatTitleGenerator:
    async def generate(self, first_user_message: str) -> str:
        return await request_model_chat_content(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "根据用户第一条消息生成一个简洁、准确的中文会话标题。"
                        "只输出标题，不要引号、前缀、句号或解释；不超过20个汉字。"
                    ),
                },
                {
                    "role": "user",
                    "content": str(first_user_message or "").strip()[:4000],
                },
            ],
            max_tokens=48,
            temperature=0.2,
            timeout_seconds=15.0,
        )


__all__ = ["ModelChatTitleGenerator"]
