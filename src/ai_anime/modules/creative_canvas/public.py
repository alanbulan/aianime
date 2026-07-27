"""Stable application API exposed by Creative Canvas."""

from ai_anime.modules.creative_canvas.application.generation_catalog import (
    GenerationCatalogQueries,
)


def generation_catalog_queries() -> GenerationCatalogQueries:
    from ai_anime.modules.creative_canvas.composition import (
        generation_catalog_queries as build,
    )

    return build()


__all__ = ["GenerationCatalogQueries", "generation_catalog_queries"]
