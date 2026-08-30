"""Tests for project subprocess output handling."""

from __future__ import annotations

import sys
from unittest.mock import AsyncMock

from ai_anime.modules.task_execution.infrastructure.project_subprocesses import (
    run_project_subprocess,
)


def test_text_output_replaces_invalid_utf8_without_losing_diagnostics():
    result = run_project_subprocess(
        [
            sys.executable,
            "-c",
            (
                "import sys; "
                "sys.stdout.buffer.write(bytes([0xB4, 0xE3]) + "
                "b'device=cuda\\n')"
            ),
        ],
        cancellation_check=AsyncMock(return_value=False),
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert isinstance(result.stdout, str)
    assert "device=cuda" in result.stdout
    assert "�" in result.stdout
