from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ROOT_ENTRYPOINTS = (
    REPO_ROOT / "AGENTS.md",
    REPO_ROOT / "CLAUDE.md",
)
REQUIRED_GUIDANCE = (
    REPO_ROOT / ".aigo" / "AI_CODING_CONTEXT.md",
    REPO_ROOT / ".aigo" / "rules" / "code-governance.md",
    REPO_ROOT / ".aigo" / "rules" / "python-backend.md",
    REPO_ROOT / ".aigo" / "rules" / "frontend-react.md",
    REPO_ROOT / ".aigo" / "rules" / "desktop-electron.md",
    REPO_ROOT / ".aigo" / "rules" / "testing.md",
    REPO_ROOT / ".aigo" / "rules" / "release-security.md",
    REPO_ROOT / "desktop" / "AGENTS.md",
    REPO_ROOT / "frontend" / "AGENTS.md",
    REPO_ROOT / "src" / "ai_anime" / "AGENTS.md",
)


def test_root_agent_entrypoints_are_present_and_byte_identical() -> None:
    missing = [path.name for path in ROOT_ENTRYPOINTS if not path.is_file()]
    assert not missing, f"Missing root agent entrypoints: {missing}"

    contents = [path.read_bytes() for path in ROOT_ENTRYPOINTS]
    assert all(contents), "Root agent entrypoints must not be empty"
    assert contents[0] == contents[1], (
        "AGENTS.md and CLAUDE.md must remain byte-identical"
    )


def test_progressive_agent_guidance_tree_is_present_and_nonempty() -> None:
    missing = [
        path.relative_to(REPO_ROOT).as_posix()
        for path in REQUIRED_GUIDANCE
        if not path.is_file()
    ]
    empty = [
        path.relative_to(REPO_ROOT).as_posix()
        for path in REQUIRED_GUIDANCE
        if path.is_file() and not path.read_text(encoding="utf-8").strip()
    ]

    assert not missing, f"Missing agent guidance files: {missing}"
    assert not empty, f"Agent guidance files must not be empty: {empty}"
