import asyncio

import pytest

from ai_anime.modules.ai_assistant.application import ProjectAssistantReplies


class StubRunLocks:
    def __init__(self):
        self.acquired = []
        self.maintained = []
        self.released = []
        self.cancelled = 0

    def acquire(self, username, project):
        self.acquired.append((username, project))
        return "lock-1"

    async def maintain(self, username, project, lock_id):
        self.maintained.append((username, project, lock_id))
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            self.cancelled += 1
            raise

    def release(self, username, project, lock_id):
        self.released.append((username, project, lock_id))


class StubDeterministicReplies:
    def __init__(self):
        self.calls = []

    async def stream(
        self,
        username,
        project,
        content,
        on_event,
        *,
        turn_id=None,
        project_dir=None,
        project_state_dir=None,
    ):
        self.calls.append(
            (username, project, content, turn_id, project_dir, project_state_dir)
        )
        await asyncio.sleep(0)
        return {"role": "assistant", "content": content}


class StubHermesReplies:
    def __init__(self, *, error=None):
        self.error = error
        self.calls = []

    async def stream(
        self,
        username,
        project,
        prompt,
        on_event,
        *,
        turn_id=None,
        project_dir=None,
        project_state_dir=None,
    ):
        self.calls.append(
            (username, project, prompt, turn_id, project_dir, project_state_dir)
        )
        await asyncio.sleep(0)
        if self.error is not None:
            raise self.error
        return {"role": "assistant", "content": "hermes reply"}


def _build_replies(*, hermes_error=None):
    run_locks = StubRunLocks()
    deterministic_replies = StubDeterministicReplies()
    hermes_replies = StubHermesReplies(error=hermes_error)
    replies = ProjectAssistantReplies(
        run_locks,
        deterministic_replies,
        hermes_replies,
    )
    return replies, run_locks, deterministic_replies, hermes_replies


async def _ignore_event(_event):
    return None


@pytest.mark.anyio
async def test_project_assistant_replies_bypasses_backend_for_reingest_confirmation(
    tmp_path,
):
    replies, locks, deterministic, hermes = _build_replies()
    prompt = """创建视频

[AI_ANIME_REINGEST_CONFIRMATION]
stage: choose_overwrite
ai_anime_project_id: project-a
filename: novel.docx
[/AI_ANIME_REINGEST_CONFIRMATION]"""

    result = await replies.stream(
        "alice",
        "project-a",
        prompt,
        _ignore_event,
        turn_id="turn-1",
        project_dir=tmp_path / "output",
        project_state_dir=tmp_path / "state",
    )

    assert "当前项目已有摄入内容" in result["content"]
    assert "新建项目" not in result["content"]
    assert hermes.calls == []
    assert deterministic.calls[0][3:] == (
        "turn-1",
        tmp_path / "output",
        tmp_path / "state",
    )
    assert locks.acquired == [("alice", "project-a")]
    assert locks.maintained == [("alice", "project-a", "lock-1")]
    assert locks.cancelled == 1
    assert locks.released == [("alice", "project-a", "lock-1")]


@pytest.mark.anyio
async def test_project_assistant_replies_dispatches_guided_prompt_to_hermes():
    replies, locks, deterministic, hermes = _build_replies()

    result = await replies.stream(
        "alice",
        "project-a",
        "帮我写一个复仇短剧",
        _ignore_event,
        turn_id="turn-2",
    )

    assert result["content"] == "hermes reply"
    assert deterministic.calls == []
    assert len(hermes.calls) == 1
    assert hermes.calls[0][2].startswith("[AI_ANIME_SCRIPT_UPLOAD_GUIDANCE]\n")
    assert hermes.calls[0][2].endswith("用户原话：帮我写一个复仇短剧")
    assert hermes.calls[0][3] == "turn-2"
    assert locks.released == [("alice", "project-a", "lock-1")]


@pytest.mark.anyio
async def test_project_assistant_replies_releases_lock_when_backend_fails():
    replies, locks, _deterministic, _hermes = _build_replies(
        hermes_error=RuntimeError("backend failed")
    )

    with pytest.raises(RuntimeError, match="backend failed"):
        await replies.stream(
            "alice",
            "project-a",
            "问题",
            _ignore_event,
        )

    assert locks.cancelled == 1
    assert locks.released == [("alice", "project-a", "lock-1")]
