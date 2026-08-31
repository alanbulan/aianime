from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.verification.infrastructure.utils import load_all_beats


@pytest.mark.asyncio
async def test_load_all_beats_propagates_store_failure(tmp_path: Path) -> None:
    class _FailingStore:
        async def get_beats_as_dicts(self, _episode_num: int):
            raise RuntimeError("database unavailable")

    with pytest.raises(RuntimeError, match="database unavailable"):
        await load_all_beats(
            tmp_path,
            1,
            sqlite_store=_FailingStore(),
        )


@pytest.mark.asyncio
async def test_load_all_beats_reports_missing_episode(tmp_path: Path) -> None:
    class _EmptyStore:
        async def get_beats_as_dicts(self, _episode_num: int):
            return []

    with pytest.raises(FileNotFoundError, match="episode 1"):
        await load_all_beats(
            tmp_path,
            1,
            sqlite_store=_EmptyStore(),
        )
