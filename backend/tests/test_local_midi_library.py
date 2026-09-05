from pathlib import Path
from dataclasses import replace

from core.infra.setup import init_app_container
from core.domain.music import ArrangementId, MusicPieceId


def minimal_midi(pitch: int = 60) -> bytes:
    return (
        b"MThd"
        + (6).to_bytes(4, "big")
        + (0).to_bytes(2, "big")
        + (1).to_bytes(2, "big")
        + (96).to_bytes(2, "big")
        + b"MTrk"
        + (12).to_bytes(4, "big")
        + bytes([0x00, 0x90, pitch, 64, 0x60, 0x80, pitch, 0, 0x00, 0xFF, 0x2F, 0x00])
    )


def test_registers_midi_files_from_watch_path(tmp_path: Path) -> None:
    midi_dir = tmp_path / "midi"
    midi_dir.mkdir()
    (midi_dir / "piece.mid").write_bytes(minimal_midi())
    state_path = tmp_path / "state.json"

    container = init_app_container(str(state_path))
    report = container.music.local_library.add_watch_path(str(midi_dir))
    pieces = container.music.query.list_pieces()

    assert report.discovered_files == 1
    assert report.registered_files == 1
    assert len(pieces) == 1
    assert pieces[0].title == "piece"


def test_refresh_reparses_an_overwritten_midi_at_the_same_path(tmp_path: Path) -> None:
    midi_dir = tmp_path / "midi"
    midi_dir.mkdir()
    midi_path = midi_dir / "piece.mid"
    midi_path.write_bytes(minimal_midi(60))
    container = init_app_container(str(tmp_path / "state.db"))

    first = container.music.local_library.add_watch_path(str(midi_dir))
    original_piece = container.music.query.list_pieces()[0]

    midi_path.write_bytes(minimal_midi(72))
    refreshed = container.music.local_library.refresh_watched_paths()
    updated_piece = container.music.query.list_pieces()[0]

    assert first.registered_files == 1
    assert refreshed.registered_files == 0
    assert refreshed.updated_files == 1
    assert len(container.music.query.list_pieces()) == 1
    assert updated_piece.id == original_piece.id
    assert updated_piece.arrangements[0].score.notes[0].pitch == 72


def test_removing_a_piece_keeps_source_file_and_refresh_reimports_it(tmp_path: Path) -> None:
    midi_dir = tmp_path / "midi"
    midi_dir.mkdir()
    midi_path = midi_dir / "piece.mid"
    midi_path.write_bytes(minimal_midi())
    container = init_app_container(str(tmp_path / "state.db"))
    container.music.local_library.add_watch_path(str(midi_dir))
    piece_id = container.music.query.list_pieces()[0].id

    container.music.command.delete_piece(MusicPieceId.parse(piece_id.value))

    assert midi_path.exists()
    assert container.music.query.list_pieces() == []

    report = container.music.local_library.refresh_watched_paths()

    assert report.registered_files == 1
    assert len(container.music.query.list_pieces()) == 1


def test_listing_pieces_does_not_implicitly_rescan_watched_files(tmp_path: Path) -> None:
    midi_dir = tmp_path / "midi"
    midi_dir.mkdir()
    midi_path = midi_dir / "piece.mid"
    midi_path.write_bytes(minimal_midi())
    container = init_app_container(str(tmp_path / "state.db"))
    container.music.local_library.add_watch_path(str(midi_dir))
    piece_id = container.music.query.list_pieces()[0].id
    container.music.command.delete_piece(piece_id)

    assert container.music.query.list_pieces() == []


def test_removing_a_piece_deletes_all_legacy_records_for_same_source_path(
    tmp_path: Path,
) -> None:
    midi_dir = tmp_path / "midi"
    midi_dir.mkdir()
    midi_path = midi_dir / "piece.mid"
    midi_path.write_bytes(minimal_midi())
    container = init_app_container(str(tmp_path / "state.db"))
    container.music.local_library.add_watch_path(str(midi_dir))
    piece = container.music.query.list_pieces()[0]

    duplicate_id = MusicPieceId.parse("legacy-duplicate")
    duplicate = type(piece)(
        id=duplicate_id,
        title=piece.title,
        creator=piece.creator,
        arrangements=[
            replace(
                piece.arrangements[0],
                id=ArrangementId.parse("legacy-arrangement"),
                piece_id=duplicate_id,
            )
        ],
        created_at=piece.created_at,
        updated_at=piece.updated_at,
    )
    container.music.command._pieces.save_piece(duplicate)

    container.music.command.delete_piece(piece.id)

    assert container.music.query.list_pieces() == []
