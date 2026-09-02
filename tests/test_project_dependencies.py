from __future__ import annotations

import tomllib
from pathlib import Path

import pytest
from packaging.markers import Marker
from packaging.requirements import Requirement


def test_aliyun_media_relay_sdk_is_packaged() -> None:
    pyproject = tomllib.loads(Path("pyproject.toml").read_text(encoding="utf-8"))
    dependencies = {
        dependency.split("[", 1)[0].split("=", 1)[0].split("<", 1)[0].split(">", 1)[0].strip()
        for dependency in pyproject["project"]["dependencies"]
    }

    assert "oss2" in dependencies


@pytest.mark.parametrize("python_version", ["3.11", "3.12"])
@pytest.mark.parametrize(
    ("sys_platform", "platform_machine", "platform_version", "expected_version"),
    [
        ("win32", "AMD64", "10.0.26100", "0.19.0"),
        ("win32", "x86_64", "10.0.26100", "0.19.0"),
        ("linux", "x86_64", "6.8.0", "0.19.0"),
        ("linux", "aarch64", "6.8.0", "0.19.0"),
        ("darwin", "x86_64", "Darwin Kernel Version 22.6.0", "0.17.1"),
        ("darwin", "x86_64", "Darwin Kernel Version 23.6.0", "0.17.1"),
        ("darwin", "x86_64", "Darwin Kernel Version 24.6.0", "0.17.1"),
        ("darwin", "x86_64", "Darwin Kernel Version 25.0.0", "0.17.1"),
        ("darwin", "arm64", "Darwin Kernel Version 22.6.0", "0.17.1"),
        ("darwin", "arm64", "Darwin Kernel Version 23.6.0", "0.17.1"),
        ("darwin", "arm64", "Darwin Kernel Version 24.6.0", "0.19.0"),
        ("darwin", "arm64", "Darwin Kernel Version 25.0.0", "0.19.0"),
    ],
)
def test_ladybug_ventura_override_preserves_other_platforms(
    python_version, sys_platform, platform_machine, platform_version, expected_version
) -> None:
    environment = {
        "sys_platform": sys_platform,
        "platform_machine": platform_machine,
        "platform_version": platform_version,
        "python_version": python_version,
        "python_full_version": f"{python_version}.9",
    }
    pyproject = tomllib.loads(Path("pyproject.toml").read_text(encoding="utf-8"))
    overrides = [
        Requirement(dependency)
        for dependency in pyproject["tool"]["uv"]["override-dependencies"]
    ]
    active = [
        requirement
        for requirement in overrides
        if requirement.name == "ladybug" and requirement.marker.evaluate(environment)
    ]
    assert [str(requirement.specifier) for requirement in active] == [
        f"=={expected_version}"
    ]

    lock = tomllib.loads(Path("uv.lock").read_text(encoding="utf-8"))
    cognee = next(package for package in lock["package"] if package["name"] == "cognee")
    selected = [
        dependency["version"]
        for dependency in cognee["dependencies"]
        if dependency["name"] == "ladybug"
        and Marker(dependency["marker"]).evaluate(environment)
    ]
    assert selected == [expected_version]
