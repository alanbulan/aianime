"""Platform release composition root."""

from ai_anime.modules.platform_release.application import (
    ProjectFileQueries,
    RuntimeConfigQueries,
)
from ai_anime.modules.platform_release.infrastructure import (
    LocalProjectFileGateway,
    ProcessRuntimeConfigEnvironment,
)

_runtime_config_environment = ProcessRuntimeConfigEnvironment()
_project_file_gateway = LocalProjectFileGateway()


def project_file_queries() -> ProjectFileQueries:
    return ProjectFileQueries(_project_file_gateway)


def runtime_config_queries() -> RuntimeConfigQueries:
    return RuntimeConfigQueries(_runtime_config_environment)
