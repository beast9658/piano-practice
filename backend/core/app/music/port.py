from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from core.domain.fingering import FingeringAnnotation
from core.domain.music import MusicPiece, MusicPieceId, PianoArrangement, PianoScore
from core.domain.piece_stages import PieceStagePlan

if TYPE_CHECKING:
    from .command import (
        CreateMusicPieceCommand,
        DiscoveredMidiFile,
        ImportPianoArrangementCommand,
    )


class MusicPieceRepositoryPort(Protocol):
    def save_piece(self, piece: MusicPiece) -> None: ...

    def find_piece(self, piece_id: MusicPieceId) -> MusicPiece | None: ...

    def list_pieces(self) -> list[MusicPiece]: ...

    def delete_piece(self, piece_id: MusicPieceId) -> bool: ...


class MusicCommandPort(Protocol):
    def create_piece(self, command: CreateMusicPieceCommand) -> MusicPiece: ...

    def import_arrangement(
        self,
        command: ImportPianoArrangementCommand,
    ) -> PianoArrangement: ...


class ActivePieceStageQueryPort(Protocol):
    def get(self, piece_id: MusicPieceId) -> PieceStagePlan | None: ...


class FingeringQueryPort(Protocol):
    def list_for_plan(
        self,
        plan_id: str,
        score_fingerprint: str,
    ) -> list[FingeringAnnotation]: ...


class WatchPathRepositoryPort(Protocol):
    def list_watch_paths(self) -> list[str]: ...

    def save_watch_paths(self, paths: list[str]) -> None: ...


class LocalMidiScannerPort(Protocol):
    def scan_path(self, path: str) -> list[DiscoveredMidiFile]: ...


class LocalMidiWatcherPort(Protocol):
    def watch_path(self, path: str) -> None: ...

    def remove_watch_path(self, path: str) -> bool: ...

    def watched_paths(self) -> list[str]: ...

    def is_dirty(self) -> bool: ...

    def clear_dirty(self) -> None: ...


class LocalMidiScoreParserPort(Protocol):
    def parse_score(self, path: str) -> PianoScore: ...


class HandAssignmentPolicy(Protocol):
    @property
    def analysis_version(self) -> str: ...

    def assign(self, score: PianoScore) -> PianoScore: ...
