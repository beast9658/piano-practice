import os
import hashlib
import threading
from pathlib import Path

from core.app.music.command import DiscoveredMidiFile
from core.app.music.port import WatchPathRepositoryPort
from core.domain.music import NoteEvent, PianoScore, ScorePart


class LocalMidiFileAdapter:
    def __init__(self, repository: WatchPathRepositoryPort) -> None:
        self._repository = repository
        self._lock = threading.RLock()
        self._known_fingerprints: dict[str, str] = {}
        self._dirty = True

    def scan_path(self, path: str) -> list[DiscoveredMidiFile]:
        root = normalize_path(path)
        files = [root] if root.is_file() else collect_midi_files(root)
        discovered = [discovered_midi_file(file) for file in files if is_valid_midi_file(file)]
        discovered.sort(key=lambda item: item.path)
        return discovered

    def watch_path(self, path: str) -> None:
        normalized = normalize_path(path)
        paths = self._repository.list_watch_paths()
        value = str(normalized)
        if value not in paths:
            paths.append(value)
            self._repository.save_watch_paths(paths)
        with self._lock:
            self._dirty = True

    def remove_watch_path(self, path: str) -> bool:
        paths = self._repository.list_watch_paths()
        if path not in paths:
            return False
        self._repository.save_watch_paths([candidate for candidate in paths if candidate != path])
        with self._lock:
            self._dirty = True
        return True

    def watched_paths(self) -> list[str]:
        return self._repository.list_watch_paths()

    def is_dirty(self) -> bool:
        snapshot = self._snapshot_watched_paths()
        with self._lock:
            if snapshot != self._known_fingerprints:
                self._dirty = True
                self._known_fingerprints = snapshot
            return self._dirty

    def clear_dirty(self) -> None:
        with self._lock:
            self._dirty = False

    def parse_score(self, path: str) -> PianoScore:
        file = Path(path)
        if not is_valid_midi_file(file):
            raise ValueError(f"not a valid MIDI file: {path}")
        return parse_midi_score(file.read_bytes())

    def _snapshot_watched_paths(self) -> dict[str, str]:
        snapshot: dict[str, str] = {}
        for path in self.watched_paths():
            try:
                root = normalize_path(path)
                files = [root] if root.is_file() else collect_midi_files(root)
            except ValueError:
                continue
            for file in files:
                discovered = discovered_midi_file(file)
                snapshot[discovered.path] = discovered.fingerprint
        return snapshot


def normalize_path(value: str) -> Path:
    value = value.strip()
    if not value:
        raise ValueError("path is empty")
    path = Path(value).expanduser().resolve()
    if not path.exists():
        raise ValueError(f"path does not exist: {path}")
    if not path.is_dir() and not path.is_file():
        raise ValueError(f"path is not a directory or file: {path}")
    return path


def collect_midi_files(directory: Path) -> list[Path]:
    files: list[Path] = []
    for root, _, filenames in os.walk(directory):
        for filename in filenames:
            path = Path(root) / filename
            if is_valid_midi_file(path):
                files.append(path)
    return files


def is_valid_midi_file(path: Path) -> bool:
    if path.suffix.lower() not in {".mid", ".midi"}:
        return False
    try:
        with path.open("rb") as file:
            return file.read(4) == b"MThd"
    except OSError:
        return False


def discovered_midi_file(path: Path) -> DiscoveredMidiFile:
    stat = path.stat()
    fingerprint = hashlib.sha256(path.read_bytes()).hexdigest()
    return DiscoveredMidiFile(
        path=str(path),
        title=path.stem.strip() or str(path),
        fingerprint=fingerprint,
        size_bytes=stat.st_size,
        modified_at=str(int(stat.st_mtime)),
    )


def parse_midi_score(bytes_: bytes) -> PianoScore:
    if len(bytes_) < 14 or not bytes_.startswith(b"MThd"):
        raise ValueError("MIDI header is invalid")
    header_len = int.from_bytes(bytes_[4:8], "big")
    if header_len < 6:
        raise ValueError("MIDI header length is invalid")
    track_count = int.from_bytes(bytes_[10:12], "big")
    division = int.from_bytes(bytes_[12:14], "big", signed=False)
    if division & 0x8000:
        raise ValueError("SMPTE timecode MIDI timing is not supported yet")
    ticks_per_beat = max(1, division)

    offset = 8 + header_len
    tempos: list[float] = []
    meters: list[str] = []
    parts: list[ScorePart] = []
    notes: list[NoteEvent] = []

    for track_index in range(track_count):
        if offset + 8 > len(bytes_) or bytes_[offset : offset + 4] != b"MTrk":
            break
        track_len = int.from_bytes(bytes_[offset + 4 : offset + 8], "big")
        track_data = bytes_[offset + 8 : offset + 8 + track_len]
        offset += 8 + track_len
        parsed = parse_track(track_data, ticks_per_beat, track_index)
        tempos.extend(parsed["tempos"])
        meters.extend(parsed["meters"])
        notes.extend(parsed["notes"])
        parts.append(
            ScorePart(
                track=track_index,
                name=parsed["name"] or f"Track {track_index + 1}",
                instrument_name=parsed["instrument_name"],
                channels=tuple(sorted(parsed["channels"])),
                note_count=len(parsed["notes"]),
            )
        )

    parts = [
        part
        for part in parts
        if part.note_count > 0
    ] or [
        ScorePart(track=index, name=f"Track {index + 1}", note_count=0)
        for index in range(track_count)
    ] or [ScorePart(track=0, name="Track 1", note_count=0)]
    if not notes:
        raise ValueError("MIDI contains no note events")
    notes.sort(key=lambda note: (note.start_beats, note.pitch, note.track))
    return PianoScore(
        parts=parts,
        notes=notes,
        tempos=tempos or [120.0],
        meters=meters or ["4/4"],
    )


def parse_track(track: bytes, ticks_per_beat: int, track_index: int) -> dict[str, list]:
    offset = 0
    absolute_ticks = 0
    running_status: int | None = None
    active: dict[tuple[int, int], list[tuple[int, int, int]]] = {}
    notes: list[NoteEvent] = []
    tempos: list[float] = []
    meters: list[str] = []
    name: str | None = None
    instrument_name: str | None = None
    channels: set[int] = set()
    note_sequence = 0

    while offset < len(track):
        delta, offset = read_vlq(track, offset)
        absolute_ticks += delta
        if offset >= len(track):
            break

        status = track[offset]
        if status & 0x80:
            offset += 1
            if status != 0xFF and status != 0xF0 and status != 0xF7:
                running_status = status
        elif running_status is not None:
            status = running_status
        else:
            break

        if status == 0xFF:
            if offset >= len(track):
                break
            meta_type = track[offset]
            offset += 1
            length, offset = read_vlq(track, offset)
            payload = track[offset : offset + length]
            offset += length
            if meta_type == 0x51 and len(payload) == 3:
                micros = int.from_bytes(payload, "big")
                if micros > 0:
                    tempos.append(60_000_000 / micros)
            elif meta_type == 0x58 and len(payload) >= 2:
                denominator = 2 ** payload[1]
                meters.append(f"{payload[0]}/{denominator}")
            elif meta_type == 0x03:
                name = decode_midi_text(payload)
            elif meta_type == 0x04:
                instrument_name = decode_midi_text(payload)
            continue

        if status in (0xF0, 0xF7):
            length, offset = read_vlq(track, offset)
            offset += length
            continue

        event_type = status & 0xF0
        channel = status & 0x0F
        channels.add(channel)
        data_len = 1 if event_type in (0xC0, 0xD0) else 2
        data = track[offset : offset + data_len]
        offset += data_len
        if len(data) < data_len:
            break

        if event_type == 0x90 and data[1] > 0:
            active.setdefault((channel, data[0]), []).append(
                (absolute_ticks, data[1], note_sequence)
            )
            note_sequence += 1
        elif event_type == 0x80 or event_type == 0x90:
            key = (channel, data[0])
            starts = active.get(key)
            if not starts:
                continue
            start_ticks, velocity, sequence = starts.pop()
            duration_ticks = absolute_ticks - start_ticks
            if duration_ticks <= 0:
                continue
            notes.append(
                NoteEvent(
                    id=f"t{track_index}-c{channel}-n{sequence}",
                    pitch=data[0],
                    start_beats=start_ticks / ticks_per_beat,
                    duration_beats=duration_ticks / ticks_per_beat,
                    velocity=velocity,
                    track=track_index,
                    channel=channel,
                )
            )

    return {
        "notes": notes,
        "tempos": tempos,
        "meters": meters,
        "name": name,
        "instrument_name": instrument_name,
        "channels": channels,
    }


def decode_midi_text(payload: bytes) -> str:
    for encoding in ("utf-8", "gb18030", "latin-1"):
        try:
            return payload.decode(encoding).strip("\x00 ")
        except UnicodeDecodeError:
            continue
    return ""


def read_vlq(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    for _ in range(4):
        if offset >= len(data):
            return value, offset
        byte = data[offset]
        offset += 1
        value = (value << 7) | (byte & 0x7F)
        if byte & 0x80 == 0:
            break
    return value, offset
