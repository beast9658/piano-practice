from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass, replace
from pathlib import Path

from core.domain.music import (
    ArrangementId,
    MusicPiece,
    MusicPieceId,
    PianoArrangement,
    PianoScore,
)
from core.app.app_error import AppError
from .port import (
    HandAssignmentPolicy,
    LocalMidiScannerPort,
    LocalMidiScoreParserPort,
    LocalMidiWatcherPort,
    MusicCommandPort,
    MusicPieceRepositoryPort,
)


@dataclass(frozen=True)
class CreateMusicPieceCommand:
    piece_id: MusicPieceId
    title: str
    creator: str | None
    now: str


@dataclass(frozen=True)
class ImportPianoArrangementCommand:
    piece_id: MusicPieceId
    arrangement_id: ArrangementId
    title: str
    source_path: str
    fingerprint: str
    score: PianoScore
    now: str


@dataclass(frozen=True)
class DiscoveredMidiFile:
    path: str
    title: str
    fingerprint: str
    size_bytes: int
    modified_at: str


@dataclass(frozen=True)
class MidiScanReport:
    watched_paths: list[str]
    discovered_files: int
    registered_files: int
    updated_files: int = 0


@dataclass(frozen=True)
class RegisterLocalMidiFileCommand:
    file: DiscoveredMidiFile
    discovered_at: str


@dataclass(frozen=True)
class RegisterLocalMidiFileResult:
    piece: MusicPiece
    created: bool
    updated: bool = False


class MusicCommandHandler:
    def __init__(self, pieces: MusicPieceRepositoryPort) -> None:
        self._pieces = pieces

    def create_piece(self, command: CreateMusicPieceCommand) -> MusicPiece:
        title = command.title.strip()
        if not title:
            raise AppError.validation("music piece title is empty")
        if self._pieces.find_piece(command.piece_id):
            raise AppError.validation(f"music piece already exists: {command.piece_id.value}")

        piece = MusicPiece(
            id=command.piece_id,
            title=title,
            creator=command.creator.strip() if command.creator else None,
            created_at=command.now,
            updated_at=command.now,
        )
        self._pieces.save_piece(piece)
        return piece

    def delete_piece(self, piece_id: MusicPieceId) -> None:
        piece = self._pieces.find_piece(piece_id)
        if piece is None:
            raise AppError.not_found("music piece not found")
        source_paths = {
            arrangement.source_path for arrangement in piece.arrangements
        }
        matching_ids = [
            candidate.id
            for candidate in self._pieces.list_pieces()
            if any(
                arrangement.source_path in source_paths
                for arrangement in candidate.arrangements
            )
        ]
        for matching_id in matching_ids:
            self._pieces.delete_piece(matching_id)

    def import_arrangement(self, command: ImportPianoArrangementCommand) -> PianoArrangement:
        piece = self._pieces.find_piece(command.piece_id)
        if piece is None:
            raise AppError.not_found("music piece not found")

        title = command.title.strip()
        if not title:
            raise AppError.validation("arrangement title is empty")
        if command.score.note_count == 0:
            raise AppError.validation("arrangement score contains no notes")

        arrangement = PianoArrangement(
            id=command.arrangement_id,
            piece_id=command.piece_id,
            title=title,
            source_path=command.source_path,
            fingerprint=command.fingerprint,
            score=command.score,
        )
        piece.replace_arrangement(arrangement, command.now)
        self._pieces.save_piece(piece)
        return arrangement


class HandAssignmentMigration:
    def __init__(
        self,
        pieces: MusicPieceRepositoryPort,
        policy: HandAssignmentPolicy,
    ) -> None:
        self._pieces = pieces
        self._policy = policy

    def migrate(self) -> int:
        migrated = 0
        for piece in self._pieces.list_pieces():
            arrangements: list[PianoArrangement] = []
            changed = False
            for arrangement in piece.arrangements:
                if arrangement.score.hand_analysis_version == self._policy.analysis_version:
                    arrangements.append(arrangement)
                    continue
                arrangements.append(replace(
                    arrangement,
                    score=self._policy.assign(arrangement.score),
                ))
                changed = True
            if changed:
                for arrangement in arrangements:
                    piece.replace_arrangement(arrangement, piece.updated_at)
                self._pieces.save_piece(piece)
                migrated += 1
        return migrated


class LocalMidiLibraryCommandHandler:
    def __init__(
        self,
        scanner: LocalMidiScannerPort,
        watcher: LocalMidiWatcherPort,
        parser: LocalMidiScoreParserPort,
        hand_assignment: HandAssignmentPolicy,
        pieces: MusicPieceRepositoryPort,
        music_command: MusicCommandPort,
    ) -> None:
        self._scanner = scanner
        self._watcher = watcher
        self._parser = parser
        self._hand_assignment = hand_assignment
        self._pieces = pieces
        self._music_command = music_command

    def add_watch_path(self, path: str) -> MidiScanReport:
        return self.add_watch_paths([path])

    def add_watch_paths(self, paths: list[str]) -> MidiScanReport:
        if not paths:
            return self.refresh_watched_paths()
        for path in paths:
            self._watcher.watch_path(path)
        return self.refresh_watched_paths()

    def remove_watch_path(self, path: str) -> bool:
        return self._watcher.remove_watch_path(path)

    def refresh_if_dirty(self) -> MidiScanReport | None:
        if not self._watcher.is_dirty():
            return None
        return self.refresh_watched_paths()

    def refresh_watched_paths(self) -> MidiScanReport:
        paths = self._watcher.watched_paths()
        discovered_files = 0
        registered_files = 0
        updated_files = 0

        for path in paths:
            files = self._scanner.scan_path(path)
            discovered_files += len(files)
            for file in files:
                result = self.register_local_midi_file(
                    RegisterLocalMidiFileCommand(
                        file=file,
                        discovered_at=unix_timestamp_seconds(),
                    )
                )
                if result.created:
                    registered_files += 1
                elif result.updated:
                    updated_files += 1

        self._watcher.clear_dirty()
        return MidiScanReport(
            watched_paths=paths,
            discovered_files=discovered_files,
            registered_files=registered_files,
            updated_files=updated_files,
        )

    def register_local_midi_file(
        self,
        command: RegisterLocalMidiFileCommand,
    ) -> RegisterLocalMidiFileResult:
        piece_id = local_midi_piece_id(command.file.path)
        arrangement_id = local_midi_arrangement_id(command.file.path)
        existing = self._pieces.find_piece(piece_id)
        if existing is None:
            existing = next(
                (
                    piece
                    for piece in self._pieces.list_pieces()
                    if any(
                        arrangement.source_path == command.file.path
                        for arrangement in piece.arrangements
                    )
                ),
                None,
            )
            if existing is not None:
                piece_id = existing.id

        existing_arrangement = None
        if existing:
            existing_arrangement = next(
                (
                    item
                    for item in existing.arrangements
                    if item.source_path == command.file.path
                ),
                None,
            )
        if (
            existing_arrangement
            and existing_arrangement.fingerprint == command.file.fingerprint
            and existing_arrangement.score.notes
        ):
            return RegisterLocalMidiFileResult(
                piece=existing,
                created=False,
                updated=False,
            )

        try:
            score = self._hand_assignment.assign(
                self._parser.parse_score(command.file.path)
            )
        except Exception as error:
            raise AppError.upstream(str(error)) from error

        if existing is None:
            piece = self._music_command.create_piece(
                CreateMusicPieceCommand(
                    piece_id=piece_id,
                    title=command.file.title,
                    creator=command.file.path,
                    now=command.discovered_at,
                )
            )
            created = True
        else:
            piece = existing
            created = False

        self._music_command.import_arrangement(
            ImportPianoArrangementCommand(
                piece_id=piece.id,
                arrangement_id=(
                    existing_arrangement.id
                    if existing_arrangement is not None
                    else arrangement_id
                ),
                title="MIDI import",
                source_path=command.file.path,
                fingerprint=command.file.fingerprint,
                score=score,
                now=command.discovered_at,
            )
        )
        updated = self._pieces.find_piece(piece.id) or piece
        return RegisterLocalMidiFileResult(
            piece=updated,
            created=created,
            updated=not created,
        )

    def import_midi_bytes(
        self,
        file_name: str,
        content: bytes,
        upload_dir: str,
    ) -> RegisterLocalMidiFileResult:
        safe_name = Path(file_name).name.strip()
        if not safe_name:
            raise AppError.validation("file name is empty")
        if not content:
            raise AppError.validation("uploaded midi is empty")
        if Path(safe_name).suffix.lower() not in {".mid", ".midi"}:
            raise AppError.validation("uploaded file must be a .mid or .midi file")

        fingerprint = hashlib.sha256(content).hexdigest()
        root = Path(upload_dir)
        root.mkdir(parents=True, exist_ok=True)
        destination = root / f"{fingerprint[:20]}-{safe_name}"
        if not destination.exists():
            try:
                descriptor = os.open(
                    destination,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                    0o600,
                )
            except FileExistsError:
                pass
            else:
                with os.fdopen(descriptor, "wb") as file:
                    file.write(content)
                    file.flush()
                    os.fsync(file.fileno())

        discovered = DiscoveredMidiFile(
            path=str(destination),
            title=Path(safe_name).stem.strip() or "Untitled MIDI",
            fingerprint=fingerprint,
            size_bytes=len(content),
            modified_at=str(int(time.time())),
        )
        return self.register_local_midi_file(
            RegisterLocalMidiFileCommand(
                file=discovered,
                discovered_at=unix_timestamp_seconds(),
            )
        )


def local_midi_piece_id(path: str) -> MusicPieceId:
    digest = hashlib.sha256(path.encode("utf-8")).hexdigest()[:16]
    return MusicPieceId.parse(f"midi-{digest}")


def local_midi_arrangement_id(path: str) -> ArrangementId:
    digest = hashlib.sha256(path.encode("utf-8")).hexdigest()[:16]
    return ArrangementId.parse(f"midi-arrangement-{digest}")


def unix_timestamp_seconds() -> str:
    return str(int(time.time()))
