import sqlite3
import threading
from pathlib import Path

from core.domain.piece_stages import PieceStage, PieceStagePlan


class SqlitePieceStageRepository:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def list(
        self,
        arrangement_id: str,
        score_fingerprint: str,
    ) -> list[PieceStagePlan]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                select id, arrangement_id, score_fingerprint, name, segmentation_prompt,
                       model, generation, is_active, created_at, analyzed_at
                from piece_stage_plans
                where arrangement_id = ? and score_fingerprint = ?
                order by is_active desc, analyzed_at desc
                """,
                (arrangement_id, score_fingerprint),
            ).fetchall()
            return [self._from_row(connection, row) for row in rows]

    def get_active(
        self,
        arrangement_id: str,
        score_fingerprint: str,
    ) -> PieceStagePlan | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                select id, arrangement_id, score_fingerprint, name, segmentation_prompt,
                       model, generation, is_active, created_at, analyzed_at
                from piece_stage_plans
                where arrangement_id = ? and score_fingerprint = ? and is_active = 1
                """,
                (arrangement_id, score_fingerprint),
            ).fetchone()
            return self._from_row(connection, row) if row else None

    def get_by_id(
        self,
        plan_id: str,
        arrangement_id: str,
        score_fingerprint: str,
    ) -> PieceStagePlan | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                select id, arrangement_id, score_fingerprint, name, segmentation_prompt,
                       model, generation, is_active, created_at, analyzed_at
                from piece_stage_plans
                where id = ? and arrangement_id = ? and score_fingerprint = ?
                """,
                (plan_id, arrangement_id, score_fingerprint),
            ).fetchone()
            return self._from_row(connection, row) if row else None

    def save_new(self, plan: PieceStagePlan) -> None:
        with self._lock, self._connect() as connection:
            if plan.is_active:
                self._deactivate_all(connection, plan.arrangement_id)
            self._insert_plan(connection, plan)
            self._insert_stages(connection, plan)

    def replace(self, plan: PieceStagePlan) -> None:
        with self._lock, self._connect() as connection:
            if plan.is_active:
                self._deactivate_all(connection, plan.arrangement_id)
            cursor = connection.execute(
                """
                update piece_stage_plans
                set score_fingerprint = ?, name = ?, segmentation_prompt = ?, model = ?,
                    generation = ?, is_active = ?, analyzed_at = ?
                where id = ? and arrangement_id = ?
                """,
                (
                    plan.score_fingerprint,
                    plan.name,
                    plan.segmentation_prompt,
                    plan.model,
                    plan.generation,
                    int(plan.is_active),
                    plan.analyzed_at,
                    plan.id,
                    plan.arrangement_id,
                ),
            )
            if cursor.rowcount != 1:
                raise ValueError("piece stage plan not found")
            connection.execute(
                "delete from piece_stages where plan_id = ?",
                (plan.id,),
            )
            self._insert_stages(connection, plan)

    def rename(self, plan_id: str, arrangement_id: str, name: str) -> None:
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "update piece_stage_plans set name = ? where id = ? and arrangement_id = ?",
                (name, plan_id, arrangement_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("piece stage plan not found")

    def delete(self, plan_id: str, arrangement_id: str) -> bool:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "select is_active from piece_stage_plans where id = ? and arrangement_id = ?",
                (plan_id, arrangement_id),
            ).fetchone()
            if row is None:
                return False
            connection.execute(
                "delete from piece_stage_plans where id = ? and arrangement_id = ?",
                (plan_id, arrangement_id),
            )
            if bool(row["is_active"]):
                replacement = connection.execute(
                    """
                    select id from piece_stage_plans
                    where arrangement_id = ?
                    order by analyzed_at desc
                    limit 1
                    """,
                    (arrangement_id,),
                ).fetchone()
                if replacement:
                    connection.execute(
                        "update piece_stage_plans set is_active = 1 where id = ?",
                        (replacement["id"],),
                    )
            return True

    def activate(self, plan_id: str, arrangement_id: str) -> None:
        with self._lock, self._connect() as connection:
            exists = connection.execute(
                "select 1 from piece_stage_plans where id = ? and arrangement_id = ?",
                (plan_id, arrangement_id),
            ).fetchone()
            if exists is None:
                raise ValueError("piece stage plan not found")
            self._deactivate_all(connection, arrangement_id)
            connection.execute(
                "update piece_stage_plans set is_active = 1 where id = ?",
                (plan_id,),
            )

    def _initialize(self) -> None:
        with self._connect() as connection:
            plan_columns = self._columns(connection, "piece_stage_plans")
            fingering_columns = self._columns(connection, "fingering_annotations")
            legacy_plans = bool(plan_columns) and not {
                "id",
                "name",
                "segmentation_prompt",
                "generation",
            }.issubset(plan_columns)
            legacy_fingerings = bool(fingering_columns) and not {
                "plan_id",
                "stage_id",
            }.issubset(fingering_columns)
            if legacy_plans or legacy_fingerings:
                connection.executescript(
                    """
                    drop table if exists fingering_annotations;
                    drop table if exists piece_stages;
                    drop table if exists piece_stage_plans;
                    """
                )
            connection.executescript(
                """
                create table if not exists piece_stage_plans (
                  id text primary key,
                  arrangement_id text not null references piano_arrangements(id) on delete cascade,
                  score_fingerprint text not null,
                  name text not null,
                  segmentation_prompt text not null default '',
                  model text not null,
                  generation integer not null check(generation > 0),
                  is_active integer not null default 0 check(is_active in (0, 1)),
                  created_at text not null,
                  analyzed_at text not null
                );

                create unique index if not exists one_active_stage_plan_per_arrangement
                  on piece_stage_plans(arrangement_id)
                  where is_active = 1;

                create table if not exists piece_stages (
                  id text primary key,
                  plan_id text not null references piece_stage_plans(id) on delete cascade,
                  position integer not null,
                  start_measure integer not null check(start_measure > 0),
                  end_measure integer not null check(end_measure >= start_measure),
                  label text not null,
                  reason text not null,
                  unique(plan_id, position),
                  unique(id, plan_id)
                );
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        connection.execute("pragma foreign_keys = on")
        return connection

    @staticmethod
    def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
        return {
            row["name"]
            for row in connection.execute(f"pragma table_info({table})")
        }

    @staticmethod
    def _deactivate_all(connection: sqlite3.Connection, arrangement_id: str) -> None:
        connection.execute(
            "update piece_stage_plans set is_active = 0 where arrangement_id = ?",
            (arrangement_id,),
        )

    @staticmethod
    def _insert_plan(connection: sqlite3.Connection, plan: PieceStagePlan) -> None:
        connection.execute(
            """
            insert into piece_stage_plans
              (id, arrangement_id, score_fingerprint, name, segmentation_prompt, model,
               generation, is_active, created_at, analyzed_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                plan.id,
                plan.arrangement_id,
                plan.score_fingerprint,
                plan.name,
                plan.segmentation_prompt,
                plan.model,
                plan.generation,
                int(plan.is_active),
                plan.created_at,
                plan.analyzed_at,
            ),
        )

    @staticmethod
    def _insert_stages(connection: sqlite3.Connection, plan: PieceStagePlan) -> None:
        connection.executemany(
            """
            insert into piece_stages
              (id, plan_id, position, start_measure, end_measure, label, reason)
            values (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    stage.id,
                    plan.id,
                    position,
                    stage.start_measure,
                    stage.end_measure,
                    stage.label,
                    stage.reason,
                )
                for position, stage in enumerate(plan.stages)
            ],
        )

    @staticmethod
    def _from_row(
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> PieceStagePlan:
        stage_rows = connection.execute(
            """
            select id, start_measure, end_measure, label, reason
            from piece_stages
            where plan_id = ?
            order by position
            """,
            (row["id"],),
        ).fetchall()
        return PieceStagePlan(
            id=row["id"],
            arrangement_id=row["arrangement_id"],
            score_fingerprint=row["score_fingerprint"],
            name=row["name"],
            segmentation_prompt=row["segmentation_prompt"],
            model=row["model"],
            generation=int(row["generation"]),
            stages=tuple(
                PieceStage(
                    id=stage["id"],
                    start_measure=int(stage["start_measure"]),
                    end_measure=int(stage["end_measure"]),
                    label=stage["label"],
                    reason=stage["reason"],
                )
                for stage in stage_rows
            ),
            created_at=row["created_at"],
            analyzed_at=row["analyzed_at"],
            is_active=bool(row["is_active"]),
        )
