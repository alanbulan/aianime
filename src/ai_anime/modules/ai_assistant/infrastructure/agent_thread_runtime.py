"""Local Claude and Codex thread lifecycle adapter."""

from __future__ import annotations

import asyncio

from ai_anime.chat.backend_sdk import (
    ClaudeSdkClient,
    CodexClient,
    interrupt_live_claude_client,
    interrupt_live_codex_turn,
)
from ai_anime.modules.ai_assistant.application.ports import (
    AgentBackend,
    AgentThread,
    AgentThreadSessions,
    AgentToolConfiguration,
    AgentWorkspace,
)


class LocalAgentThreadRuntime:
    def __init__(
        self,
        backend: AgentBackend,
        sessions: AgentThreadSessions,
        workspace: AgentWorkspace,
        tool_configuration: AgentToolConfiguration,
    ) -> None:
        self._backend = backend
        self._sessions = sessions
        self._workspace = workspace
        self._tool_configuration = tool_configuration

    def open_claude(
        self,
        username: str,
        project: str,
        agent_token: str,
    ) -> AgentThread:
        workspace = self._workspace.ensure_claude(username, project, agent_token)
        client = ClaudeSdkClient(
            cli_path=self._backend.claude_cli_path(),
            cwd=workspace,
            env=self._workspace.build_environment(username, project, agent_token),
            model=self._backend.claude_model(),
        )
        thread_id = self._sessions.get_active(username, "claude")
        return client.thread_resume(thread_id) if thread_id else client.thread_start()

    def open_codex(
        self,
        username: str,
        project: str,
        agent_token: str,
    ) -> AgentThread:
        workspace = self._workspace.ensure_codex(username)
        client = CodexClient(
            codex_bin=self._backend.codex_bin_path(),
            cwd=workspace,
            env=self._workspace.build_environment(username, project, agent_token),
            model=self._backend.codex_model(),
            config_overrides=self._tool_configuration.codex_config_overrides(),
        )
        thread_id = self._sessions.get_active(username, "codex")
        return client.thread_resume(thread_id) if thread_id else client.thread_start()

    def remember(
        self,
        username: str,
        backend: str,
        thread_id: str,
    ) -> None:
        self._sessions.set_active(username, backend, thread_id)

    async def interrupt(
        self,
        backend: str,
        thread_id: str,
        turn_id: str,
    ) -> bool:
        thread_id = str(thread_id or "").strip()
        turn_id = str(turn_id or "").strip()
        if backend == "claude":
            if not thread_id:
                return False
            try:
                return await interrupt_live_claude_client(thread_id)
            except Exception as exc:
                if "closed stdout" in str(exc):
                    return True
                raise
        if backend == "codex":
            if not thread_id or not turn_id:
                return False
            try:
                return await asyncio.to_thread(
                    interrupt_live_codex_turn,
                    thread_id,
                    turn_id,
                )
            except Exception as exc:
                if "app-server closed stdout" in str(exc):
                    return True
                raise
        return False
