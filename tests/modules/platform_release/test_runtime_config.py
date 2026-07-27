from __future__ import annotations

from ai_anime.modules.platform_release.domain import build_runtime_config


def test_runtime_config_requires_auth_for_enterprise_edition() -> None:
    config = build_runtime_config(
        edition="ee",
        desktop_mode=False,
        instance_id="instance-a",
    )

    assert config.edition == "ee"
    assert config.auth_required is True
    assert config.instance_id == "instance-a"


def test_runtime_config_requires_auth_for_desktop_ce() -> None:
    config = build_runtime_config(
        edition="ce",
        desktop_mode=True,
        instance_id="instance-b",
    )

    assert config.auth_required is True
