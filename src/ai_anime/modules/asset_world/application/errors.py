"""Expected failures raised by Asset & World application services."""


class StyleRejected(Exception):
    """A valid request rejected by a style business rule or dependency."""


class InvalidStyleInput(Exception):
    """Invalid style input that maps to a client validation response."""


class UnsupportedStyleMedia(Exception):
    """Unsupported uploaded style-preview media."""


class StyleStorageFailed(Exception):
    """A style-preview file could not be persisted."""
