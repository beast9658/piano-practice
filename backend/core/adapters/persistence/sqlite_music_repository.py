import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

from core.domain.music import (
    ArrangementId,
    MusicPiece,
    MusicPieceId,
    NoteEvent,
    PianoArrangement,
    PianoScore,
    ScorePart,
)


class SqliteMusicPieceRepository:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def save_piece(self, piece: MusicPiece) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                insert into music_pieces (id, title, creator, created_at, updated_at)
                values (?, ?, ?, ?, ?)
                on conflict(id) do update set
                  title = excluded.title,
                  creator = excluded.creator,
                  updated_at = excluded.updated_at
                """,
                (
                    piece.id.value,
                    piece.title,
                    piece.creator,
                    piece.created_at,
                    piece.updated_at,
                ),
            )
            connection.execute(
                "delete from piano_arrangements where piece_id = ?",
                (piece.id.value,),
            )
            for arrangement in piece.arrangements:
                connection.execute(
                    """
                    insert into piano_arrangements
                      (id, piece_id, title, source_path, fingerprint, score_json)
                    values (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        arrangement.id.value,
                        arrangement.piece_id.value,
                        arrangement.title,
                        arrangement.source_path,
                        arrangement.fingerprint,
                        json.dumps(score_to_dict(arrangement.score), ensure_ascii=False),
                    ),
                )

    def find_piece(self, piece_id: MusicPieceId) -> MusicPiece | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                select id, title, creator, created_at, updated_at
                from music_pieces
                where id = ?
                """,
                (piece_id.value,),
            ).fetchone()
            if row is None:
                return None
            return self._piece_from_row(connection, row)

    def list_pieces(self) -> list[MusicPiece]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                select id, title, creator, created_at, updated_at
                from music_pieces
                order by lower(title)
                """
            ).fetchall()
            return [self._piece_from_row(connection, row) for row in rows]

    def delete_piece(self, piece_id: MusicPieceId) -> bool:
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "delete from music_pieces where id = ?",
                (piece_id.value,),
            )
            return cursor.rowcount > 0

    def list_watch_paths(self) -> list[str]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "select path from local_midi_watch_paths order by path"
            ).fetchall()
            return [row["path"] for row in rows]

    def save_watch_paths(self, paths: list[str]) -> None:
        with self._lock, self._connect() as connection:
            connection.execute("delete from local_midi_watch_paths")
            connection.executemany(
                "insert into local_midi_watch_paths (path) values (?)",
                [(path,) for path in sorted(dict.fromkeys(paths))],
            )

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                create table if not exists music_pieces (
                  id text primary key,
                  title text not null,
                  creator text,
                  created_at text not null,
                  updated_at text not null
                );

                create table if not exists piano_arrangements (
                  id text primary key,
                  piece_id text not null references music_pieces(id) on delete cascade,
                  title text not null,
                  source_path text not null,
                  fingerprint text not null,
                  score_json text not null
                );

                create table if not exists local_midi_watch_paths (
                  path text primary key
                );
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        connection.execute("pragma foreign_keys = on")
        return connection

    def _piece_from_row(
        self, connection: sqlite3.Connection, row: sqlite3.Row
    ) -> MusicPiece:
        piece = MusicPiece(
            id=MusicPieceId.parse(row["id"]),
            title=row["title"],
            creator=row["creator"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        arrangements = connection.execute(
            """
            select id, piece_id, title, source_path, fingerprint, score_json
            from piano_arrangements
            where piece_id = ?
            order by title
            """,
            (piece.id.value,),
        ).fetchall()
        piece.arrangements = []
        for item in arrangements:
            score = score_from_dict(json.loads(item["score_json"]))
            piece.arrangements.append(PianoArrangement(
                id=ArrangementId.parse(item["id"]),
                piece_id=MusicPieceId.parse(item["piece_id"]),
                title=item["title"],
                source_path=item["source_path"],
                fingerprint=item["fingerprint"],
                score=score,
            ))
        return piece


def score_to_dict(score: PianoScore) -> dict[str, Any]:
    return {
        "parts": [
            {
                "track": part.track,
                "name": part.name,
                "note_count": part.note_count,
                "instrument_name": part.instrument_name,
                "channels": list(part.channels),
                "hand": part.hand,
                "hand_confidence": part.hand_confidence,
            }
            for part in score.parts
        ],
        "notes": [
            {
                "pitch": note.pitch,
                "id": note.id,
                "start_beats": note.start_beats,
                "duration_beats": note.duration_beats,
                "velocity": note.velocity,
                "track": note.track,
                "channel": note.channel,
                "hand": note.hand,
                "hand_confidence": note.hand_confidence,
            }
            for note in score.notes
        ],
        "tempos": score.tempos,
        "meters": score.meters,
        "hand_analysis_version": score.hand_analysis_version,
    }


def score_from_dict(data: dict[str, Any]) -> PianoScore:
    score = PianoScore(
        parts=[
            ScorePart(
                track=int(part.get("track", index)),
                name=part["name"],
                note_count=int(part.get("note_count", 0)),
                instrument_name=part.get("instrument_name"),
                channels=tuple(int(value) for value in part.get("channels", [])),
                hand=part.get("hand", "unknown"),
                hand_confidence=float(part.get("hand_confidence", 0.0)),
            )
            for index, part in enumerate(data.get("parts", []))
        ],
        notes=[
            NoteEvent(
                id=note.get("id", f"legacy-{index}"),
                pitch=int(note["pitch"]),
                start_beats=float(note["start_beats"]),
                duration_beats=float(note["duration_beats"]),
                velocity=(
                    int(note["velocity"])
                    if note.get("velocity") is not None
                    else None
                ),
                track=int(note.get("track", 0)),
                channel=int(note.get("channel", 0)),
                hand=note.get("hand", "unknown"),
                hand_confidence=float(note.get("hand_confidence", 0.0)),
            )
            for index, note in enumerate(data.get("notes", []))
        ],
        tempos=[float(value) for value in data.get("tempos", [])],
        meters=list(data.get("meters", [])),
        hand_analysis_version=data.get("hand_analysis_version"),
    )
    return score
