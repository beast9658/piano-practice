import json
import sqlite3
import threading
from pathlib import Path

from core.domain.fingering import (
    FingeringCandidate,
    FingeringCandidateAssignment,
    FingeringTrial,
    FingeringTrialPass,
)


class SqliteFingeringTrialRepository:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def save_candidates(self, candidates: tuple[FingeringCandidate, ...]) -> None:
        with self._lock, self._connect() as connection:
            for candidate in candidates:
                connection.execute(
                    """
                    insert into fingering_candidates
                      (id, piece_id, plan_id, stage_id, arrangement_id,
                       score_fingerprint, name, strategy, start_measure, end_measure,
                       start_beat, end_beat, features_json, created_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        candidate.id,
                        candidate.piece_id,
                        candidate.plan_id,
                        candidate.stage_id,
                        candidate.arrangement_id,
                        candidate.score_fingerprint,
                        candidate.name,
                        candidate.strategy,
                        candidate.start_measure,
                        candidate.end_measure,
                        candidate.start_beat,
                        candidate.end_beat,
                        json.dumps(candidate.features, ensure_ascii=False),
                        candidate.created_at,
                    ),
                )
                connection.executemany(
                    """
                    insert into fingering_candidate_assignments
                      (candidate_id, note_id, hand, finger)
                    values (?, ?, ?, ?)
                    """,
                    [
                        (candidate.id, item.note_id, item.hand, item.finger)
                        for item in candidate.assignments
                    ],
                )

    def list_candidates(
        self,
        piece_id: str,
        stage_id: str | None = None,
    ) -> list[FingeringCandidate]:
        where = "where piece_id = ?"
        parameters: list[str] = [piece_id]
        if stage_id:
            where += " and stage_id = ?"
            parameters.append(stage_id)
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                f"""
                select * from fingering_candidates
                {where}
                order by created_at desc, name
                """,
                parameters,
            ).fetchall()
            return [self._candidate_from_row(connection, row) for row in rows]

    def get_candidate(self, candidate_id: str) -> FingeringCandidate | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "select * from fingering_candidates where id = ?",
                (candidate_id,),
            ).fetchone()
            return self._candidate_from_row(connection, row) if row else None

    def save_trial(self, trial: FingeringTrial) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                insert into fingering_trials
                  (id, piece_id, plan_id, stage_id, arrangement_id,
                   score_fingerprint, protocol, mode, bpm, start_measure,
                   end_measure, start_beat, end_beat, candidate_ids_json,
                   status, created_at, completed_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    trial.id,
                    trial.piece_id,
                    trial.plan_id,
                    trial.stage_id,
                    trial.arrangement_id,
                    trial.score_fingerprint,
                    trial.protocol,
                    trial.mode,
                    trial.bpm,
                    trial.start_measure,
                    trial.end_measure,
                    trial.start_beat,
                    trial.end_beat,
                    json.dumps(trial.candidate_ids),
                    trial.status,
                    trial.created_at,
                    trial.completed_at,
                ),
            )
            connection.executemany(
                """
                insert into fingering_trial_passes
                  (id, trial_id, candidate_id, position, status, adherence)
                values (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        item.id,
                        trial.id,
                        item.candidate_id,
                        item.position,
                        item.status,
                        item.adherence,
                    )
                    for item in trial.passes
                ],
            )

    def get_trial(self, trial_id: str) -> FingeringTrial | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "select * from fingering_trials where id = ?",
                (trial_id,),
            ).fetchone()
            if row is None:
                return None
            return self._trial_from_row(connection, row)

    def list_trials(self, piece_id: str) -> list[FingeringTrial]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                select * from fingering_trials
                where piece_id = ?
                order by created_at desc
                """,
                (piece_id,),
            ).fetchall()
            return [self._trial_from_row(connection, row) for row in rows]

    def start_pass(self, trial_id: str, pass_id: str, started_at: str) -> None:
        with self._lock, self._connect() as connection:
            existing = connection.execute(
                """
                select status from fingering_trial_passes
                where id = ? and trial_id = ?
                """,
                (pass_id, trial_id),
            ).fetchone()
            if existing is not None and existing["status"] == "running":
                return
            cursor = connection.execute(
                """
                update fingering_trial_passes
                set status = 'running', started_at = ?
                where id = ? and trial_id = ? and status = 'pending'
                """,
                (started_at, pass_id, trial_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("trial pass is not pending")

    def complete_pass(
        self,
        trial_id: str,
        pass_id: str,
        practice_session_id: str,
        adherence: str,
        comfort_rating: int | None,
        completed_at: str,
    ) -> None:
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                update fingering_trial_passes
                set status = 'completed', practice_session_id = ?, adherence = ?,
                    comfort_rating = ?, completed_at = ?
                where id = ? and trial_id = ? and status = 'running'
                """,
                (
                    practice_session_id,
                    adherence,
                    comfort_rating,
                    completed_at,
                    pass_id,
                    trial_id,
                ),
            )
            if cursor.rowcount != 1:
                raise ValueError("trial pass is not running")
            remaining = connection.execute(
                """
                select count(*) from fingering_trial_passes
                where trial_id = ? and status != 'completed'
                """,
                (trial_id,),
            ).fetchone()[0]
            if remaining == 0:
                connection.execute(
                    """
                    update fingering_trials
                    set status = 'completed', completed_at = ?
                    where id = ?
                    """,
                    (completed_at, trial_id),
                )

    def cancel_trial(self, trial_id: str, completed_at: str) -> None:
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                update fingering_trials
                set status = 'cancelled', completed_at = ?
                where id = ? and status = 'running'
                """,
                (completed_at, trial_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("only a running trial can be cancelled")

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                create table if not exists fingering_candidates (
                  id text primary key,
                  piece_id text not null references music_pieces(id) on delete cascade,
                  plan_id text not null,
                  stage_id text not null,
                  arrangement_id text not null,
                  score_fingerprint text not null,
                  name text not null,
                  strategy text not null,
                  start_measure integer not null,
                  end_measure integer not null,
                  start_beat real not null,
                  end_beat real not null,
                  features_json text not null,
                  created_at text not null
                );

                create table if not exists fingering_candidate_assignments (
                  candidate_id text not null references fingering_candidates(id) on delete cascade,
                  note_id text not null,
                  hand text not null check(hand in ('left', 'right')),
                  finger integer not null check(finger between 1 and 5),
                  primary key (candidate_id, note_id)
                );

                create index if not exists idx_fingering_candidates_piece_stage
                  on fingering_candidates(piece_id, stage_id, created_at desc);

                create table if not exists fingering_trials (
                  id text primary key,
                  piece_id text not null references music_pieces(id) on delete cascade,
                  plan_id text not null,
                  stage_id text not null,
                  arrangement_id text not null,
                  score_fingerprint text not null,
                  protocol text not null,
                  mode text not null,
                  bpm integer not null,
                  start_measure integer not null,
                  end_measure integer not null,
                  start_beat real not null,
                  end_beat real not null,
                  candidate_ids_json text not null,
                  status text not null,
                  created_at text not null,
                  completed_at text
                );

                create table if not exists fingering_trial_passes (
                  id text primary key,
                  trial_id text not null references fingering_trials(id) on delete cascade,
                  candidate_id text not null references fingering_candidates(id),
                  position integer not null,
                  status text not null,
                  practice_session_id text,
                  adherence text not null,
                  comfort_rating integer,
                  started_at text,
                  completed_at text,
                  unique(trial_id, position)
                );
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        connection.execute("pragma foreign_keys = on")
        return connection

    @staticmethod
    def _candidate_from_row(
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> FingeringCandidate:
        assignment_rows = connection.execute(
            """
            select note_id, hand, finger
            from fingering_candidate_assignments
            where candidate_id = ?
            order by note_id
            """,
            (row["id"],),
        ).fetchall()
        return FingeringCandidate(
            id=row["id"],
            piece_id=row["piece_id"],
            plan_id=row["plan_id"],
            stage_id=row["stage_id"],
            arrangement_id=row["arrangement_id"],
            score_fingerprint=row["score_fingerprint"],
            name=row["name"],
            strategy=row["strategy"],
            start_measure=int(row["start_measure"]),
            end_measure=int(row["end_measure"]),
            start_beat=float(row["start_beat"]),
            end_beat=float(row["end_beat"]),
            assignments=tuple(
                FingeringCandidateAssignment(
                    note_id=item["note_id"],
                    hand=item["hand"],
                    finger=int(item["finger"]),
                )
                for item in assignment_rows
            ),
            features=json.loads(row["features_json"]),
            created_at=row["created_at"],
        )

    @staticmethod
    def _trial_from_row(
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> FingeringTrial:
        pass_rows = connection.execute(
            """
            select p.*, s.summary_json
            from fingering_trial_passes p
            left join practice_sessions s on s.id = p.practice_session_id
            where p.trial_id = ?
            order by p.position
            """,
            (row["id"],),
        ).fetchall()
        return FingeringTrial(
            id=row["id"],
            piece_id=row["piece_id"],
            plan_id=row["plan_id"],
            stage_id=row["stage_id"],
            arrangement_id=row["arrangement_id"],
            score_fingerprint=row["score_fingerprint"],
            protocol=row["protocol"],
            mode=row["mode"],
            bpm=int(row["bpm"]),
            start_measure=int(row["start_measure"]),
            end_measure=int(row["end_measure"]),
            start_beat=float(row["start_beat"]),
            end_beat=float(row["end_beat"]),
            candidate_ids=tuple(json.loads(row["candidate_ids_json"])),
            passes=tuple(
                FingeringTrialPass(
                    id=item["id"],
                    candidate_id=item["candidate_id"],
                    position=int(item["position"]),
                    status=item["status"],
                    practice_session_id=item["practice_session_id"],
                    adherence=item["adherence"],
                    comfort_rating=item["comfort_rating"],
                    started_at=item["started_at"],
                    completed_at=item["completed_at"],
                    summary=(
                        json.loads(item["summary_json"])
                        if item["summary_json"] else None
                    ),
                )
                for item in pass_rows
            ),
            status=row["status"],
            created_at=row["created_at"],
            completed_at=row["completed_at"],
        )
