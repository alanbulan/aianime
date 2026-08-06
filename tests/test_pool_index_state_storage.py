from __future__ import annotations

import json

from ai_anime.modules.production.public import PoolIndex


def _configure_roots(monkeypatch, tmp_path):
    from ai_anime.shared.utils import state_index_files

    output_root = tmp_path / "output"
    state_root = tmp_path / "state"
    monkeypatch.setattr(state_index_files, "OUTPUT_DIR", str(output_root))
    monkeypatch.setattr(state_index_files, "STATE_DIR", str(state_root))
    return output_root, state_root


def test_save_pool_index_writes_state_sidecar_not_output(monkeypatch, tmp_path):
    output_root, state_root = _configure_roots(monkeypatch, tmp_path)
    from ai_anime.modules.generators.pool_indexer import save_pool_index

    grids_dir = output_root / "admin" / "demo" / "grids" / "ep001"
    grids_dir.mkdir(parents=True)
    pool = PoolIndex(episode=1, beat_assignments={"1": "render/beat_01.png"})

    saved_path = save_pool_index(pool, grids_dir)

    expected_path = state_root / "admin" / "demo" / "grids" / "ep001" / "pool_index.json"
    assert saved_path == expected_path
    assert expected_path.exists()
    assert not (grids_dir / "pool_index.json").exists()
    payload = json.loads(expected_path.read_text(encoding="utf-8"))
    assert payload["beat_assignments"] == {"1": "render/beat_01.png"}


def test_load_pool_index_lazily_moves_legacy_output_sidecar(monkeypatch, tmp_path):
    output_root, state_root = _configure_roots(monkeypatch, tmp_path)
    from ai_anime.modules.generators.pool_indexer import load_pool_index

    grids_dir = output_root / "admin" / "demo" / "grids" / "ep001"
    grids_dir.mkdir(parents=True)
    legacy_path = grids_dir / "pool_index.json"
    legacy_path.write_text(
        json.dumps(
            {
                "episode": 1,
                "generated_at": "2026-01-01T00:00:00",
                "version": 2,
                "modes": {},
                "grids": [],
                "images": [],
                "beat_assignments": {"1": "render/beat_01.png"},
            }
        ),
        encoding="utf-8",
    )

    pool = load_pool_index(grids_dir)

    state_path = state_root / "admin" / "demo" / "grids" / "ep001" / "pool_index.json"
    assert pool is not None
    assert pool.beat_assignments == {"1": "render/beat_01.png"}
    assert state_path.exists()
    assert not legacy_path.exists()
