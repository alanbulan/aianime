"""Creative Canvas application composition."""

from functools import lru_cache

from ai_anime.modules.creative_canvas.application.generation_catalog import (
    GenerationCatalogQueries,
)
from ai_anime.modules.creative_canvas.infrastructure.generation_catalog import (
    ConfiguredGenerationCatalogSource,
)


@lru_cache(maxsize=1)
def generation_catalog_queries() -> GenerationCatalogQueries:
    return GenerationCatalogQueries(ConfiguredGenerationCatalogSource())
