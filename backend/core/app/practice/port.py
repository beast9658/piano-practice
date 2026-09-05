from typing import Protocol

from core.domain.practice import PracticeSessionRecord


class PracticeSessionRepositoryPort(Protocol):
    def save(self, session: PracticeSessionRecord) -> None: ...

    def list_for_piece(
        self,
        piece_id: str,
        limit: int = 20,
    ) -> list[PracticeSessionRecord]: ...
