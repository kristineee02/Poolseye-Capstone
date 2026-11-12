"""Event-emission rules shared by the PoolsEye video pipeline and tests."""


def should_emit_events(source_kind: str, loop_count: int) -> bool:
    """Uploaded videos emit incidents only during their first playback."""
    return source_kind != "video" or loop_count == 0
