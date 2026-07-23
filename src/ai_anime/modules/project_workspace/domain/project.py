"""Project identity and access rules."""

from __future__ import annotations

from dataclasses import dataclass

PROJECT_ROLE_VIEWER = "viewer"
PROJECT_ROLE_EDITOR = "editor"
PROJECT_ROLE_ADMIN = "admin"
PROJECT_ROLE_OWNER = "owner"

ROLE_ORDER = {
    PROJECT_ROLE_VIEWER: 10,
    PROJECT_ROLE_EDITOR: 20,
    PROJECT_ROLE_ADMIN: 30,
    PROJECT_ROLE_OWNER: 40,
}


@dataclass(frozen=True)
class ProjectRecord:
    id: str
    owner_type: str
    owner_id: str
    owner_username: str
    name: str
    home_node_id: str
    output_dir: str
    state_dir: str
    runtime_dir: str
    status: str
    created_at: str = ""
    updated_at: str = ""
    purged_at: str | None = None


@dataclass(frozen=True)
class Principal:
    type: str
    id: str


class ProjectRoleRequired(Exception):
    def __init__(self, required: str, actual: str | None = None) -> None:
        self.required = required
        self.actual = actual
        super().__init__(f"project role required: {required}")


def role_allows(actual: str, required: str) -> bool:
    return ROLE_ORDER.get(actual, 0) >= ROLE_ORDER.get(required, 0)


def require_role_value(actual: str | None, required: str) -> None:
    if not actual or not role_allows(actual, required):
        raise ProjectRoleRequired(required, actual)
