from pathlib import Path

import pytest

from ai_anime.modules.project_workspace.application.project_scope import (
    context_from_record,
    is_record_home_node,
)
from ai_anime.modules.project_workspace.public import (
    Principal,
    ProjectContext,
    ProjectHomeNodeRequired,
    ProjectRecord,
    require_project_home_node,
)


def _ctx(tmp_path: Path, *, is_home_node: bool) -> ProjectContext:
    return ProjectContext(
        project_id="proj_123",
        project_name="demo",
        owner_type="user",
        owner_id="user_owner",
        owner_username="alice",
        requester_user_id="user_editor",
        requester_username="bob",
        requester_principals=(("user", "user_editor"),),
        effective_role="editor",
        home_node_id="node_a",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=is_home_node,
    )


def test_require_project_home_node_allows_local_project(tmp_path):
    ctx = _ctx(tmp_path, is_home_node=True)

    assert require_project_home_node(ctx) is ctx


def test_require_project_home_node_rejects_remote_project(tmp_path):
    ctx = _ctx(tmp_path, is_home_node=False)

    with pytest.raises(ProjectHomeNodeRequired) as exc:
        require_project_home_node(ctx, operation="read project files")

    assert exc.value.project_id == "proj_123"
    assert exc.value.home_node_id == "node_a"
    assert exc.value.operation == "read project files"


def test_context_from_record_treats_ce_local_home_node_as_local(tmp_path):
    record = ProjectRecord(
        id="proj_local",
        owner_type="user",
        owner_id="local",
        owner_username="alice",
        name="demo",
        home_node_id="local",
        output_dir=str(tmp_path / "output"),
        state_dir=str(tmp_path / "state"),
        runtime_dir=str(tmp_path / "runtime"),
        status="active",
    )

    ctx = context_from_record(
        project=record,
        requester_user_id="local",
        requester_username="alice",
        principals=[Principal("user", "local")],
        role="owner",
        is_home_node=is_record_home_node(record, "node_other"),
    )

    assert ctx.is_home_node is True
    assert require_project_home_node(ctx) is ctx
