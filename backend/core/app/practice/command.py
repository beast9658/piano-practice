from dataclasses import dataclass
from typing import Any

from core.app.app_error import AppError
from core.app.music.port import MusicPieceRepositoryPort
from core.domain.music import MusicPieceId
from core.domain.practice import PracticeSessionRecord
from .port import PracticeSessionRepositoryPort


@dataclass(frozen=True)
class SavePracticeSessionCommand:
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


class PracticeSessionCommandHandler:
    def __init__(
        self,
        sessions: PracticeSessionRepositoryPort,
        pieces: MusicPieceRepositoryPort,
    ) -> None:
        self._sessions = sessions
        self._pieces = pieces

    def save(self, command: SavePracticeSessionCommand) -> PracticeSessionRecord:
        if self._pieces.find_piece(MusicPieceId.parse(command.piece_id)) is None:
            raise AppError.not_found("piece not found")
        try:
            session = PracticeSessionRecord(
                id=command.id,
                piece_id=command.piece_id,
                started_at=command.started_at,
                ended_at=command.ended_at,
                initial_mode=command.initial_mode,
                initial_bpm=command.initial_bpm,
                scope=command.scope,
                events=command.events,
                attempts=command.attempts,
                summary=command.summary,
            )
        except ValueError as error:
            raise AppError.validation(str(error)) from error
        self._sessions.save(session)
        return session
