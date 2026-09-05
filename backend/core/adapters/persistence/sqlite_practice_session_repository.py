import json
import sqlite3
import threading
from pathlib import Path

from core.domain.practice import PracticeSessionRecord


class SqlitePracticeSessionRepository:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def save(self, session: PracticeSessionRecord) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                insert into practice_sessions
                  (id, piece_id, started_at, ended_at, initial_mode, initial_bpm,
                   scope_json, event_count, note_count, accuracy, summary_json, events_json,
                   attempts_json)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(id) do update set
                  ended_at = excluded.ended_at,
                  scope_json = excluded.scope_json,
                  event_count = excluded.event_count,
                  note_count = excluded.note_count,
                  accuracy = excluded.accuracy,
                  summary_json = excluded.summary_json,
                  events_json = excluded.events_json,
                  attempts_json = excluded.attempts_json
                """,
                (
                    session.id,
                    session.piece_id,
                    session.started_at,
                    session.ended_at,
                    session.initial_mode,
                    session.initial_bpm,
                    json.dumps(session.scope, ensure_ascii=False),
                    len(session.events),
                    int(session.summary.get("noteCount", len(session.attempts))),
                    session.summary.get("accuracy"),
                    json.dumps(session.summary, ensure_ascii=False),
                    json.dumps(session.events, ensure_ascii=False),
                    json.dumps(session.attempts, ensure_ascii=False),
                ),
            )

    def list_for_piece(
        self,
        piece_id: str,
        limit: int = 20,
    ) -> list[PracticeSessionRecord]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                select id, piece_id, started_at, ended_at, initial_mode,
                       initial_bpm, scope_json, events_json, attempts_json, summary_json
                from practice_sessions
                where piece_id = ?
                order by started_at desc
                limit ?
                """,
                (piece_id, limit),
            ).fetchall()
        return [
            PracticeSessionRecord(
                id=row["id"],
                piece_id=row["piece_id"],
                started_at=row["started_at"],
                ended_at=row["ended_at"],
                initial_mode=row["initial_mode"],
                initial_bpm=int(row["initial_bpm"]),
                scope=dict(json.loads(row["scope_json"])),
                events=tuple(json.loads(row["events_json"])),
                attempts=tuple(json.loads(row["attempts_json"])),
                summary=dict(json.loads(row["summary_json"])),
            )
            for row in rows
        ]

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                create table if not exists practice_sessions (
                  id text primary key,
                  piece_id text not null references music_pieces(id) on delete cascade,
                  started_at text not null,
                  ended_at text not null,
                  initial_mode text not null,
                  initial_bpm integer not null,
                  scope_json text not null default '{}',
                  event_count integer not null,
                  note_count integer not null,
                  accuracy real,
                  summary_json text not null,
                  events_json text not null,
                  attempts_json text not null
                );

                create index if not exists idx_practice_sessions_piece_started
                  on practice_sessions(piece_id, started_at desc);
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("pragma table_info(practice_sessions)")
            }
            if "scope_json" not in columns:
                connection.execute(
                    "alter table practice_sessions add column scope_json text not null default '{}'"
                )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        connection.execute("pragma foreign_keys = on")
        return connection
