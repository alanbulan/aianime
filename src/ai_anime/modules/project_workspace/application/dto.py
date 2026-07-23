"""Commands and results owned by Project Workspace use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class RequesterIdentity:
    user_id: str
    username: str

    @classmethod
    def from_mapping(cls, user: Mapping[str, Any]) -> RequesterIdentity:
        return cls(
            user_id=str(user.get("user_id") or user.get("id") or "").strip(),
            username=str(user.get("username") or "").strip(),
        )


@dataclass(frozen=True)
class AccessibleProject:
    id: str
    name: str
    owner_username: str
    owner_type: str
    owner_id: str
    effective_role: str
    home_node_id: str
    status: str

    def payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "owner_username": self.owner_username,
            "owner_type": self.owner_type,
            "owner_id": self.owner_id,
            "effective_role": self.effective_role,
            "home_node_id": self.home_node_id,
            "status": self.status,
        }


@dataclass(frozen=True)
class ProjectSummaryData:
    id: str
    name: str
    owner_type: str
    owner_id: str
    owner_username: str
    effective_role: str
    home_node_id: str
    status: str
    archived_at: str | None = None
    deleted_at: str | None = None
    purged_at: str | None = None
    updated_at: str | None = None
    episode_count: int | None = None
    beat_count: int | None = None

    def payload(self, *, omit_empty_purged_at: bool = False) -> dict[str, Any]:
        data = {
            "id": self.id,
            "name": self.name,
            "owner_type": self.owner_type,
            "owner_id": self.owner_id,
            "owner_username": self.owner_username,
            "effective_role": self.effective_role,
            "home_node_id": self.home_node_id,
            "status": self.status,
            "archived_at": self.archived_at,
            "deleted_at": self.deleted_at,
            "purged_at": self.purged_at,
            "updated_at": self.updated_at,
            "episode_count": self.episode_count,
            "beat_count": self.beat_count,
        }
        if omit_empty_purged_at and self.purged_at is None:
            data.pop("purged_at")
        return data
