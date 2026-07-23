"""T0-7 特征化基线之一：auth legacy-dict 键集快照。

技术方案点名的热路径契约——全代码库几十处按键名读取 auth 返回的用户 dict。
T4 新建 FileAuthPort 时这个键集最容易悄悄变形，本测试把"拆分前"的形状钉死：
两种实现（control_plane 的 EE 实现 / 将来的 FileAuthPort）都必须产出同样的键集。

Identity & Access 模块接管 DTO 后，本文件只通过模块 public API 验证稳定键集。
"""

from __future__ import annotations

import pytest

from ai_anime.api.auth import AUTH_COOKIE_NAME
from ai_anime.modules.identity_access.public import (
    AgentAuthenticatedUser,
    AuthenticatedUser,
)

pytestmark = pytest.mark.m01

# 拆分前实测（2026-06-11，HEAD 4f9481a4）的契约，不许漂移：
BROWSER_LEGACY_KEYS = {"id", "user_id", "username", "role"}
AGENT_LEGACY_KEYS = BROWSER_LEGACY_KEYS | {
    "credential_kind",
    "agent_session_id",
    "agent_kind",
    "worker_id",
    "scopes",
    "current_scope_kind",
    "current_project_id",
    "parent_session_id",
}


def test_auth_cookie_name_is_ai_anime_session() -> None:
    assert AUTH_COOKIE_NAME == "ai_anime_session"


def test_browser_legacy_dict_key_set() -> None:
    user = AuthenticatedUser(id="u1", username="alice", role="owner")
    data = user.to_legacy_dict()
    assert set(data) == BROWSER_LEGACY_KEYS
    assert data["id"] == data["user_id"], "id 与 user_id 必须是同值别名"


def test_agent_legacy_dict_key_set() -> None:
    user = AgentAuthenticatedUser(
        id="u1",
        username="alice",
        role="owner",
        agent_session_id="as1",
        scopes=("projects:write",),
    )
    data = user.to_legacy_dict()
    assert set(data) == AGENT_LEGACY_KEYS
    assert data["credential_kind"] == "agent_session"
    assert isinstance(data["scopes"], list), "scopes 必须序列化为 list"
    assert data["current_scope_kind"] == "home", "默认 scope kind 为 home"
