from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PracticeSessionRecord:
    id: str
    piece_id: str
    started_at: str
    ended_at: str
    initial_mode: str
    initial_bpm: int
    scope: dict[str, Any]
    events: tuple[dict[str, Any], ...]
    attempts: tuple[dict[str, Any], ...]
    summary: dict[str, Any]

    def __post_init__(self) -> None:
        if not self.id or not self.piece_id:
            raise ValueError("practice session id and piece id are required")
        if not self.started_at or not self.ended_at:
            raise ValueError("practice session timestamps are required")
        if self.initial_bpm <= 0:
            raise ValueError("practice session bpm must be positive")
