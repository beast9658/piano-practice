from core.domain.practice import PracticeSessionRecord

from .port import PracticeSessionRepositoryPort


class PracticeSessionQueryHandler:
    def __init__(self, sessions: PracticeSessionRepositoryPort) -> None:
        self._sessions = sessions

    def list_for_piece(
        self,
        piece_id: str,
        limit: int = 20,
    ) -> list[PracticeSessionRecord]:
        return self._sessions.list_for_piece(piece_id, max(1, min(100, limit)))
