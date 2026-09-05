import sqlite3
import threading
from pathlib import Path

from core.domain.fingering import FingeringAnnotation


class SqliteFingeringRepository:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def list_for_plan(
        self,
        plan_id: str,
        score_fingerprint: str,
    ) -> list[FingeringAnnotation]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                select plan_id, stage_id, arrangement_id, score_fingerprint, note_id,
                       hand, finger, source, status, confidence, revision_id, updated_at
                from fingering_annotations
                where plan_id = ? and score_fingerprint = ?
                order by note_id
                """,
                (plan_id, score_fingerprint),
            ).fetchall()
        return [self._from_row(row) for row in rows]

    def replace_for_notes(
        self,
        plan_id: str,
        note_ids: set[str],
        annotations: list[FingeringAnnotation],
    ) -> None:
        if not note_ids:
            return
        with self._lock, self._connect() as connection:
            placeholders = ",".join("?" for _ in note_ids)
            connection.execute(
                f"delete from fingering_annotations where plan_id = ? and note_id in ({placeholders})",
                (plan_id, *sorted(note_ids)),
            )
            connection.executemany(
                """
                insert into fingering_annotations
                  (plan_id, stage_id, arrangement_id, score_fingerprint, note_id, hand,
                   finger, source, status, confidence, revision_id, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(plan_id, note_id) do update set
                  stage_id = excluded.stage_id,
                  arrangement_id = excluded.arrangement_id,
                  score_fingerprint = excluded.score_fingerprint,
                  hand = excluded.hand,
                  finger = excluded.finger,
                  source = excluded.source,
                  status = excluded.status,
                  confidence = excluded.confidence,
                  revision_id = excluded.revision_id,
                  updated_at = excluded.updated_at
                """,
                [
                    (
                        item.plan_id,
                        item.stage_id,
                        item.arrangement_id,
                        item.score_fingerprint,
                        item.note_id,
                        item.hand,
                        item.finger,
                        item.source,
                        item.status,
                        item.confidence,
                        item.revision_id,
                        item.updated_at,
                    )
                    for item in annotations
                ],
            )

    def _initialize(self) -> None:
        with self._connect() as connection:
            columns = {
                row["name"]
                for row in connection.execute("pragma table_info(fingering_annotations)")
            }
            if columns and not {"plan_id", "stage_id"}.issubset(columns):
                connection.execute("drop table fingering_annotations")
            connection.execute(
                """
                create table if not exists fingering_annotations (
                  plan_id text not null,
                  stage_id text not null,
                  arrangement_id text not null,
                  score_fingerprint text not null,
                  note_id text not null,
                  hand text not null check(hand in ('left', 'right')),
                  finger integer not null check(finger between 1 and 5),
                  source text not null,
                  status text not null,
                  confidence real not null,
                  revision_id text not null,
                  updated_at text not null,
                  primary key (plan_id, note_id),
                  foreign key (stage_id, plan_id)
                    references piece_stages(id, plan_id) on delete cascade
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        connection.execute("pragma foreign_keys = on")
        return connection

    @staticmethod
    def _from_row(row: sqlite3.Row) -> FingeringAnnotation:
        return FingeringAnnotation(
            plan_id=row["plan_id"],
            stage_id=row["stage_id"],
            arrangement_id=row["arrangement_id"],
            score_fingerprint=row["score_fingerprint"],
            note_id=row["note_id"],
            hand=row["hand"],
            finger=int(row["finger"]),
            source=row["source"],
            status=row["status"],
            confidence=float(row["confidence"]),
            revision_id=row["revision_id"],
            updated_at=row["updated_at"],
        )
