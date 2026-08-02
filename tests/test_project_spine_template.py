from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.api.projects_schemas import ProjectUpdate
from ai_anime.api.story_intake_schemas import IngestStart
from ai_anime.modules.narrative_planning.public import NovelEpisode

pytestmark = pytest.mark.m03


def test_project_update_accepts_spine_template_values():
    assert ProjectUpdate(spine_template="narrated").spine_template == "narrated"
    assert ProjectUpdate(spine_template="drama").spine_template == "drama"
    assert (
        IngestStart(
            filename="novel.txt",
            textModel="cloud-text-standard",
            embeddingModel="cloud-embedding-standard",
            spine_template="narrated",
        ).spine_template
        == "narrated"
    )


def test_project_update_accepts_aspect_ratio_values():
    assert ProjectUpdate(aspect_ratio="2:3").aspect_ratio == "2:3"
    assert ProjectUpdate(aspect_ratio="16:9").aspect_ratio == "16:9"
    assert ProjectUpdate(aspect_ratio="9:16").aspect_ratio == "9:16"


def test_project_config_defaults_to_drama(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_ANIME_DATA_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(tmp_path / "output"))
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))

    import importlib

    import ai_anime.config as cfg
    import ai_anime.project_config as pc
    import ai_anime.utils.project_paths as pp

    importlib.reload(cfg)
    importlib.reload(pp)
    importlib.reload(pc)

    from ai_anime.modules.asset_world.public import StyleService

    monkeypatch.setattr(
        StyleService,
        "get_style_labels",
        lambda username=None, project=None: {"chinese_period_drama": "古装"},
    )

    assert pc.load_project_config("alice", "demo")["spine_template"] == "drama"
    assert pc.load_project_config("alice", "demo")["aspect_ratio"] == "2:3"


class _EpisodeStore:
    def __init__(self, episodes):
        self._episodes = episodes
        self.closed = False

    def get_all_episodes(self):
        return self._episodes

    async def close(self):
        self.closed = True


def _ctx(tmp_path, *, username: str = "alice", project: str = "demo"):
    return SimpleNamespace(
        project_id="project_123",
        owner_username=username,
        project_name=project,
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
    )


def _ctx_resolver(tmp_path):
    async def resolve(**kwargs):
        return _ctx(tmp_path)

    return resolve


def _legacy_resolution(tmp_path, *, username: str = "alice", project: str = "demo"):
    return SimpleNamespace(
        ctx=None,
        username=username,
        project_name=project,
        project_dir=tmp_path,
        output_dir=str(tmp_path / "out"),
        state_dir=str(tmp_path / "state"),
        runtime_dir=str(tmp_path / "run"),
    )


def _project_scope_resolver(tmp_path):
    async def resolve(*args, **kwargs):
        return SimpleNamespace(
            ctx=_ctx(tmp_path),
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    return resolve


@pytest.mark.asyncio
async def test_update_project_saves_spine_template_before_import(monkeypatch, tmp_path):
    from ai_anime.api.routes import projects

    saved: dict = {}

    monkeypatch.setattr(projects, "resolve_project_context", _ctx_resolver(tmp_path))
    monkeypatch.setattr(projects, "require_project_home_node", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        projects,
        "load_project_config_from_state_dir",
        lambda state_dir, **_kwargs: {"visual_style": "chinese_period_drama", **saved},
    )
    monkeypatch.setattr(
        projects,
        "save_project_config_in_state_dir",
        lambda state_dir, config=None, **kwargs: saved.update(config or {}),
    )

    async def make_empty_store(ctx):
        return _EpisodeStore([])

    monkeypatch.setattr(projects, "make_sqlite_store_for_context", make_empty_store)

    response = await projects.update_project(
        "demo",
        ProjectUpdate(spine_template="narrated"),
        {"username": "alice"},
    )

    assert response["ok"] is True
    assert saved["spine_template"] == "narrated"
    assert saved["aspect_ratio"] == "16:9"
    assert response["data"]["spine_template"] == "narrated"
    assert response["data"]["aspect_ratio"] == "16:9"


@pytest.mark.asyncio
async def test_update_project_keeps_explicit_aspect_ratio_when_spine_template_changes(
    monkeypatch, tmp_path
):
    from ai_anime.api.routes import projects

    saved = {"spine_template": "drama", "aspect_ratio": "9:16"}

    monkeypatch.setattr(projects, "resolve_project_context", _ctx_resolver(tmp_path))
    monkeypatch.setattr(projects, "require_project_home_node", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        projects,
        "load_project_config_from_state_dir",
        lambda state_dir, **_kwargs: {"visual_style": "chinese_period_drama", **saved},
    )
    monkeypatch.setattr(
        projects,
        "save_project_config_in_state_dir",
        lambda state_dir, config=None, **kwargs: saved.update(config or {}),
    )

    async def make_empty_store(ctx):
        return _EpisodeStore([])

    monkeypatch.setattr(projects, "make_sqlite_store_for_context", make_empty_store)

    response = await projects.update_project(
        "demo",
        ProjectUpdate(spine_template="narrated", aspect_ratio="9:16"),
        {"username": "alice"},
    )

    assert response["ok"] is True
    assert saved["spine_template"] == "narrated"
    assert saved["aspect_ratio"] == "9:16"


@pytest.mark.asyncio
async def test_update_project_accepts_frontend_portrait_aspect_ratio(monkeypatch, tmp_path):
    from ai_anime.api.routes import projects

    saved = {"spine_template": "drama", "aspect_ratio": "9:16"}

    monkeypatch.setattr(projects, "resolve_project_context", _ctx_resolver(tmp_path))
    monkeypatch.setattr(projects, "require_project_home_node", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        projects,
        "load_project_config_from_state_dir",
        lambda state_dir, **_kwargs: {"visual_style": "chinese_period_drama", **saved},
    )
    monkeypatch.setattr(
        projects,
        "save_project_config_in_state_dir",
        lambda state_dir, config=None, **kwargs: saved.update(config or {}),
    )

    async def make_empty_store(ctx):
        return _EpisodeStore([])

    monkeypatch.setattr(projects, "make_sqlite_store_for_context", make_empty_store)

    response = await projects.update_project(
        "demo",
        ProjectUpdate(aspect_ratio="2:3"),
        {"username": "alice"},
    )

    assert response["ok"] is True
    assert saved["aspect_ratio"] == "2:3"
    assert response["data"]["aspect_ratio"] == "2:3"


@pytest.mark.asyncio
async def test_update_project_rejects_spine_template_change_after_import(
    monkeypatch, tmp_path
):
    from fastapi.responses import JSONResponse

    from ai_anime.api.routes import projects

    saved = {"spine_template": "drama"}

    monkeypatch.setattr(projects, "resolve_project_context", _ctx_resolver(tmp_path))
    monkeypatch.setattr(projects, "require_project_home_node", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        projects,
        "load_project_config_from_state_dir",
        lambda state_dir, **_kwargs: {"visual_style": "chinese_period_drama", **saved},
    )
    monkeypatch.setattr(
        projects,
        "save_project_config_in_state_dir",
        lambda state_dir, config=None, **kwargs: saved.update(config or {}),
    )

    async def make_imported_store(ctx):
        return _EpisodeStore([NovelEpisode(number=1, title="第一集")])

    monkeypatch.setattr(projects, "make_sqlite_store_for_context", make_imported_store)

    response = await projects.update_project(
        "demo",
        ProjectUpdate(spine_template="narrated"),
        {"username": "alice"},
    )

    assert isinstance(response, JSONResponse)
    assert response.status_code == 400
    assert saved["spine_template"] == "drama"


@pytest.mark.asyncio
async def test_start_ingest_allows_spine_template_change_during_rebuild(
    monkeypatch, tmp_path
):
    from ai_anime.api.routes import ingest
    from ai_anime.modules.story_intake import bootstrap as story_intake_bootstrap

    saved = {"spine_template": "drama"}
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    (uploads / "novel.txt").write_text("正文", encoding="utf-8")

    monkeypatch.setattr(ingest, "resolve_project_scope", _project_scope_resolver(tmp_path))
    monkeypatch.setattr(
        ingest,
        "load_project_config",
        lambda username, project: {"visual_style": "chinese_period_drama", **saved},
    )
    monkeypatch.setattr(
        ingest,
        "save_project_config",
        lambda username, project, config=None, **kwargs: saved.update(config or {}),
    )

    class _TaskSubmissions:
        async def submit(self, ctx, submission):
            return SimpleNamespace(
                task_id="task-ingest",
                task_key="task:ingest_fast:project:project-1:0",
                backend="inline",
                queue="inline",
            )

    monkeypatch.setattr(
        story_intake_bootstrap,
        "project_task_submission_use_cases",
        lambda: _TaskSubmissions(),
    )

    response = await ingest.start_ingest(
        "demo",
        IngestStart(
            filename="novel.txt",
            textModel="cloud-text-standard",
            embeddingModel="cloud-embedding-standard",
            rebuild=True,
            spine_template="narrated",
        ),
        {"username": "alice"},
    )

    assert response["ok"] is True
    assert response["task_id"] == "task-ingest"
    assert saved["spine_template"] == "narrated"
    assert saved["aspect_ratio"] == "16:9"


@pytest.mark.asyncio
async def test_start_ingest_rejects_spine_template_change_without_rebuild(
    monkeypatch, tmp_path
):
    from ai_anime.api.routes import ingest

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    (uploads / "novel.txt").write_text("正文", encoding="utf-8")

    monkeypatch.setattr(ingest, "resolve_project_scope", _project_scope_resolver(tmp_path))

    response = await ingest.start_ingest(
        "demo",
        IngestStart(
            filename="novel.txt",
            textModel="cloud-text-standard",
            embeddingModel="cloud-embedding-standard",
            rebuild=False,
            spine_template="narrated",
        ),
        {"username": "alice"},
    )

    assert response["ok"] is False
    assert "重新导入" in response["error"]
