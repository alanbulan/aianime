"""Expected failures raised by Asset & World application services."""


class CharacterCatalogRejected(Exception):
    """A character catalog request rejected by an expected business rule."""


class CharacterAlreadyExists(CharacterCatalogRejected):
    """A character name is already present in the project."""


class CharacterNotFound(CharacterCatalogRejected):
    """The requested character does not exist."""


class InvalidCharacterInput(CharacterCatalogRejected):
    """Character input is not valid for the requested operation."""


class CharacterAssetHistoryRejected(CharacterCatalogRejected):
    """A character asset-history request is invalid."""


class CharacterAssetHistoryNotFound(CharacterAssetHistoryRejected):
    """The requested character asset backup does not exist."""


class CharacterVoiceRejected(Exception):
    """A character voice request rejected by an expected business rule."""


class CharacterVoiceNotFound(CharacterVoiceRejected):
    """The requested character does not exist."""


class InvalidCharacterVoiceInput(CharacterVoiceRejected):
    """Uploaded, recorded, or trim input is invalid."""


class UnsupportedCharacterVoiceSlot(CharacterVoiceRejected):
    """The requested voice slot is not part of the supported domain set."""


class StyleRejected(Exception):
    """A valid request rejected by a style business rule or dependency."""


class InvalidStyleInput(Exception):
    """Invalid style input that maps to a client validation response."""


class UnsupportedStyleMedia(Exception):
    """Unsupported uploaded style-preview media."""


class StyleStorageFailed(Exception):
    """A style-preview file could not be persisted."""
