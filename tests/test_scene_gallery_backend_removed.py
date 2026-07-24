from pathlib import Path


def test_dead_grid_preview_backend_flow_is_removed() -> None:
    generation_source = Path("src/ai_anime/api/routes/generation.py").read_text(
        encoding="utf-8"
    )
    schemas_source = Path("src/ai_anime/api/schemas.py").read_text(encoding="utf-8")
    task_identity_source = Path("src/ai_anime/task_identity.py").read_text(
        encoding="utf-8"
    )

    assert '"/projects/{project}/episodes/{episode_num}/grids/generate"' not in generation_source
    assert "GridGenerateRequest" not in generation_source
    assert "GridGenerateRequest" not in schemas_source
    assert not Path("src/ai_anime/ray_tasks.py").exists()
    assert '"grid_preview"' not in task_identity_source


def test_shared_grid_backend_remains_for_grid_galleries() -> None:
    generation_source = Path("src/ai_anime/api/routes/generation.py").read_text(
        encoding="utf-8"
    )
    pool_source = Path("src/ai_anime/api/routes/production_pool.py").read_text(
        encoding="utf-8"
    )

    assert '"/projects/{project}/episodes/{episode_num}/grids"' in pool_source
    assert '"/projects/{project}/episodes/{episode_num}/grids/{grid_index}/sketch-preview"' in (
        pool_source
    )
    assert "async def list_grids" in pool_source
    assert "async def list_grids" not in generation_source
    assert "async def sketch_grid_preview" in pool_source
    assert "async def sketch_grid_preview" not in generation_source
