"""Usage meter resolver backed by the process port registry."""

from ai_anime.modules.model_usage.application import UsageMeter
from ai_anime.shared.ports import registry


def resolve_registered_usage_meter() -> UsageMeter:
    try:
        meter = registry.get_port("usage_meter")
    except registry.PortNotRegistered:
        from ai_anime.modules.model_usage.infrastructure.local_usage import (
            NoOpUsageMeter,
        )

        return NoOpUsageMeter()
    if not hasattr(meter, "reserve_current_model_call_credit"):
        from ai_anime.modules.model_usage.infrastructure.local_usage import (
            NoOpUsageMeter,
        )

        return NoOpUsageMeter()
    return meter
