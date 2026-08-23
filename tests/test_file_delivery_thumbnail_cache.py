"""Thumbnail fallback cache behavior for local project media."""

from pathlib import Path

from ai_anime.api.file_delivery import _response_for
from ai_anime.modules.platform_release.public import ProjectFileDelivery


def test_cold_thumbnail_fallback_does_not_cache_original(tmp_path: Path) -> None:
    source = tmp_path / "portrait.png"
    source.write_bytes(b"png")
    response = _response_for(
        ProjectFileDelivery(
            path=source,
            redirect_url=None,
            download_name=None,
        ),
        cache_control="private, no-store",
    )

    assert response.headers["cache-control"] == "private, no-store"
