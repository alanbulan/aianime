"""Creative Canvas principal rules."""

from collections.abc import Mapping


def canvas_actor_id(user: Mapping[str, object]) -> str:
    return str(user.get("id") or user.get("user_id") or user.get("username") or "")
