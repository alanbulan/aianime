"""Runtime composition for Identity & Access."""

from ai_anime.modules.identity_access.application.errors import (
    IdentityBackendNotInitialized,
)
from ai_anime.modules.identity_access.application.sessions import (
    AgentSessions,
    BrowserSessions,
)
from ai_anime.ports.registry import PortNotRegistered, get_port


def browser_sessions() -> BrowserSessions:
    try:
        return BrowserSessions(get_port("auth"))
    except PortNotRegistered:
        raise IdentityBackendNotInitialized("auth backend not initialised") from None


def agent_sessions() -> AgentSessions:
    try:
        return AgentSessions(get_port("auth_session"))
    except PortNotRegistered:
        raise IdentityBackendNotInitialized("agent sessions require control plane") from None
