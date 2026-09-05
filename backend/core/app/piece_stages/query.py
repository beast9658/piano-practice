from core.app.app_error import AppError
from core.domain.music import MusicPieceId
from core.domain.piece_stages import PieceStagePlan

from .port import MusicPieceRepositoryPort, PieceStageRepositoryPort


class PieceStageQueryHandler:
    def __init__(
        self,
        pieces: MusicPieceRepositoryPort,
        stages: PieceStageRepositoryPort,
    ) -> None:
        self._pieces = pieces
        self._stages = stages

    def list(self, piece_id: MusicPieceId) -> list[PieceStagePlan]:
        arrangement = self._arrangement(piece_id)
        return self._stages.list(arrangement.id.value, arrangement.fingerprint)

    def get(self, piece_id: MusicPieceId) -> PieceStagePlan | None:
        arrangement = self._arrangement(piece_id)
        return self._stages.get_active(arrangement.id.value, arrangement.fingerprint)

    def get_by_id(
        self,
        piece_id: MusicPieceId,
        plan_id: str,
    ) -> PieceStagePlan | None:
        arrangement = self._arrangement(piece_id)
        return self._stages.get_by_id(
            plan_id,
            arrangement.id.value,
            arrangement.fingerprint,
        )

    def _arrangement(self, piece_id: MusicPieceId):
        piece = self._pieces.find_piece(piece_id)
        if piece is None or not piece.arrangements:
            raise AppError.not_found("piece score not found")
        return piece.arrangements[0]
