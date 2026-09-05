import json
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


class JsonMusicPieceRepository:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def save_piece(self, piece: MusicPiece) -> None:
        with self._lock:
            data = self._read()
            pieces = data.setdefault("pieces", {})
            pieces[piece.id.value] = piece_to_dict(piece)
            self._write(data)

    def find_piece(self, piece_id: MusicPieceId) -> MusicPiece | None:
        with self._lock:
            raw = self._read().get("pieces", {}).get(piece_id.value)
            return piece_from_dict(raw) if raw else None

    def list_pieces(self) -> list[MusicPiece]:
        with self._lock:
            pieces = [
                piece_from_dict(raw)
                for raw in self._read().get("pieces", {}).values()
            ]
            return sorted(pieces, key=lambda item: item.title.lower())

    def delete_piece(self, piece_id: MusicPieceId) -> bool:
        with self._lock:
            data = self._read()
            removed = data.setdefault("pieces", {}).pop(piece_id.value, None)
            if removed is not None:
                self._write(data)
            return removed is not None

    def list_watch_paths(self) -> list[str]:
        with self._lock:
            return list(self._read().get("watch_paths", []))

    def save_watch_paths(self, paths: list[str]) -> None:
        with self._lock:
            data = self._read()
            data["watch_paths"] = sorted(dict.fromkeys(paths))
            self._write(data)

    def _read(self) -> dict[str, Any]:
        if not self._path.exists():
            return {"pieces": {}, "watch_paths": []}
        return json.loads(self._path.read_text(encoding="utf-8"))

    def _write(self, data: dict[str, Any]) -> None:
        self._path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )


def piece_to_dict(piece: MusicPiece) -> dict[str, Any]:
    return {
        "id": piece.id.value,
        "title": piece.title,
        "creator": piece.creator,
        "created_at": piece.created_at,
        "updated_at": piece.updated_at,
        "arrangements": [
            {
                "id": arrangement.id.value,
                "piece_id": arrangement.piece_id.value,
                "title": arrangement.title,
                "source_path": arrangement.source_path,
                "fingerprint": arrangement.fingerprint,
                "score": {
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
                        for part in arrangement.score.parts
                    ],
                    "notes": [
                        {
                            "id": note.id,
                            "pitch": note.pitch,
                            "start_beats": note.start_beats,
                            "duration_beats": note.duration_beats,
                            "velocity": note.velocity,
                            "track": note.track,
                            "channel": note.channel,
                            "hand": note.hand,
                            "hand_confidence": note.hand_confidence,
                        }
                        for note in arrangement.score.notes
                    ],
                    "tempos": arrangement.score.tempos,
                    "meters": arrangement.score.meters,
                    "hand_analysis_version": arrangement.score.hand_analysis_version,
                },
            }
            for arrangement in piece.arrangements
        ],
    }


def piece_from_dict(data: dict[str, Any]) -> MusicPiece:
    return MusicPiece(
        id=MusicPieceId.parse(data["id"]),
        title=data["title"],
        creator=data.get("creator"),
        created_at=data.get("created_at", ""),
        updated_at=data.get("updated_at", ""),
        arrangements=[
            PianoArrangement(
                id=ArrangementId.parse(item["id"]),
                piece_id=MusicPieceId.parse(item["piece_id"]),
                title=item["title"],
                source_path=item["source_path"],
                fingerprint=item["fingerprint"],
                score=score_from_dict(item.get("score", {})),
            )
            for item in data.get("arrangements", [])
        ],
    )


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
                velocity=note.get("velocity"),
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
