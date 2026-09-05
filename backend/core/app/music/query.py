from dataclasses import dataclass

from core.domain.fingering import FingeringAnnotation
from core.domain.music import MusicPiece, MusicPieceId

from .port import (
    ActivePieceStageQueryPort,
    FingeringQueryPort,
    LocalMidiWatcherPort,
    MusicPieceRepositoryPort,
)


@dataclass(frozen=True)
class MusicPieceScore:
    piece: MusicPiece
    annotations: tuple[FingeringAnnotation, ...] = ()


class MusicQueryHandler:
    def __init__(self, pieces: MusicPieceRepositoryPort) -> None:
        self._pieces = pieces

    def get_piece(self, piece_id: MusicPieceId) -> MusicPiece | None:
        return self._pieces.find_piece(piece_id)

    def list_pieces(self) -> list[MusicPiece]:
        return self._pieces.list_pieces()


class LocalMidiLibraryQueryHandler:
    def __init__(self, watcher: LocalMidiWatcherPort) -> None:
        self._watcher = watcher

    def list_watch_paths(self) -> list[str]:
        return self._watcher.watched_paths()


class MusicScoreQueryHandler:
    def __init__(
        self,
        pieces: MusicPieceRepositoryPort,
        stage_plans: ActivePieceStageQueryPort,
        fingerings: FingeringQueryPort,
    ) -> None:
        self._pieces = pieces
        self._stage_plans = stage_plans
        self._fingerings = fingerings

    def get(self, piece_id: MusicPieceId) -> MusicPieceScore | None:
        piece = self._pieces.find_piece(piece_id)
        if piece is None:
            return None

        arrangement = piece.arrangements[0] if piece.arrangements else None
        if arrangement is None:
            return MusicPieceScore(piece=piece)

        active_plan = self._stage_plans.get(piece_id)
        annotations = (
            self._fingerings.list_for_plan(active_plan.id, arrangement.fingerprint)
            if active_plan is not None
            else []
        )
        return MusicPieceScore(piece=piece, annotations=tuple(annotations))
