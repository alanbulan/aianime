from pathlib import Path


def test_dead_grid_preview_backend_flow_is_removed() -> None:
    routes_root = Path("src/ai_anime/api/routes")
    schemas_root = Path("src/ai_anime/api")
    routes_source = "\n".join(
        path.read_text(encoding="utf-8") for path in routes_root.glob("*.py")
    )
    schemas_source = "\n".join(
        path.read_text(encoding="utf-8") for path in schemas_root.glob("*_schemas.py")
    )
    task_identity_source = Path("src/ai_anime/task_identity.py").read_text(
        encoding="utf-8"
    )

    assert not (routes_root / "generation.py").exists()
    assert not (schemas_root / "schemas.py").exists()
    assert '"/projects/{project}/episodes/{episode_num}/grids/generate"' not in routes_source
    assert "GridGenerateRequest" not in routes_source
    assert "GridGenerateRequest" not in schemas_source
    assert not Path("src/ai_anime/ray_tasks.py").exists()
    assert '"grid_preview"' not in task_identity_source


def test_shared_grid_backend_remains_for_grid_galleries() -> None:
    routes_root = Path("src/ai_anime/api/routes")
    pool_source = Path("src/ai_anime/api/routes/production_pool.py").read_text(
        encoding="utf-8"
    )

    assert not (routes_root / "generation.py").exists()
    assert '"/projects/{project}/episodes/{episode_num}/grids"' in pool_source
    assert '"/projects/{project}/episodes/{episode_num}/grids/{grid_index}/sketch-preview"' in (
        pool_source
    )
    assert "async def list_grids" in pool_source
    assert "async def sketch_grid_preview" in pool_source
