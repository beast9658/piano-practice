from pathlib import Path

from core.adapters.local_midi import parse_midi_score
from core.adapters.persistence.sqlite_music_repository import SqliteMusicPieceRepository
from core.app.music import DynamicProgrammingHandAssignment
from core.domain.music import (
    ArrangementId,
    MusicPiece,
    MusicPieceId,
    NoteEvent,
    PianoArrangement,
    PianoScore,
    ScorePart,
)
from core.infra.setup import init_app_container


hand_assignment = DynamicProgrammingHandAssignment()


def note(note_id: str, pitch: int, beat: float, track: int = 0) -> NoteEvent:
    return NoteEvent(
        id=note_id,
        pitch=pitch,
        start_beats=beat,
        duration_beats=1,
        velocity=80,
        track=track,
        channel=0,
    )


def test_uses_explicit_hand_track_names() -> None:
    score = PianoScore(
        parts=[
            ScorePart(track=0, name="Left Hand", note_count=1),
            ScorePart(track=1, name="Right Hand", note_count=1),
        ],
        notes=[note("left", 60, 0, 0), note("right", 55, 0, 1)],
    )

    analyzed = hand_assignment.assign(score)

    assert [item.hand for item in analyzed.notes] == ["left", "right"]
    assert all(item.hand_confidence == 0.99 for item in analyzed.notes)


def test_splits_a_mixed_piano_chord_by_pitch_and_continuity() -> None:
    score = PianoScore(
        parts=[ScorePart(track=0, name="Piano", note_count=8)],
        notes=[
            note("l1", 43, 0),
            note("l2", 50, 0),
            note("r1", 64, 0),
            note("r2", 67, 0),
            note("l3", 45, 1),
            note("l4", 52, 1),
            note("r3", 65, 1),
            note("r4", 69, 1),
        ],
    )

    analyzed = hand_assignment.assign(score)
    assignments = {item.id: item.hand for item in analyzed.notes}

    assert {assignments[item] for item in ("l1", "l2", "l3", "l4")} == {"left"}
    assert {assignments[item] for item in ("r1", "r2", "r3", "r4")} == {"right"}
    assert analyzed.hand_analysis_version == "dp-v1"


def test_parser_preserves_channel_and_assigns_stable_note_id() -> None:
    track = bytes(
        [
            0x00,
            0xFF,
            0x03,
            0x05,
            *b"Piano",
            0x00,
            0x92,
            60,
            64,
            0x60,
            0x82,
            60,
            0,
            0x00,
            0xFF,
            0x2F,
            0x00,
        ]
    )
    midi = (
        b"MThd"
        + (6).to_bytes(4, "big")
        + (0).to_bytes(2, "big")
        + (1).to_bytes(2, "big")
        + (96).to_bytes(2, "big")
        + b"MTrk"
        + len(track).to_bytes(4, "big")
        + track
    )

    score = parse_midi_score(midi)

    assert score.parts[0].name == "Piano"
    assert score.parts[0].channels == (2,)
    assert score.notes[0].id == "t0-c2-n0"
    assert score.notes[0].channel == 2
    assert score.notes[0].hand == "unknown"
    assert score.hand_analysis_version is None


def test_container_migrates_legacy_hand_assignment_explicitly(tmp_path: Path) -> None:
    database = tmp_path / "state.db"
    repository = SqliteMusicPieceRepository(database)
    piece_id = MusicPieceId.parse("legacy-piece")
    repository.save_piece(MusicPiece(
        id=piece_id,
        title="Legacy",
        arrangements=[PianoArrangement(
            id=ArrangementId.parse("legacy-arrangement"),
            piece_id=piece_id,
            title="Legacy",
            source_path="/tmp/legacy.mid",
            fingerprint="legacy-score",
            score=PianoScore(
                parts=[ScorePart(track=0, name="Piano", note_count=2)],
                notes=[note("low", 48, 0), note("high", 72, 0)],
            ),
        )],
    ))

    before = repository.find_piece(piece_id)
    assert before is not None
    assert before.arrangements[0].score.hand_analysis_version is None

    container = init_app_container(str(database))
    migrated = container.music.query.get_piece(piece_id)

    assert migrated is not None
    score = migrated.arrangements[0].score
    assert score.hand_analysis_version == hand_assignment.analysis_version
    assert {item.hand for item in score.notes} == {"left", "right"}
    assert init_app_container(str(database)).music.query.get_piece(piece_id) == migrated
