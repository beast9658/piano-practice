import sqlite3
import threading
from pathlib import Path

from core.domain.llm_settings import LlmSettings


class SqliteLlmSettingsRepository:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def get(self) -> LlmSettings | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "select base_url, model, updated_at from llm_settings where id = 1"
            ).fetchone()
        if row is None:
            return None
        return LlmSettings.create(
            base_url=row["base_url"],
            model=row["model"],
            updated_at=row["updated_at"],
        )

    def save(self, settings: LlmSettings) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                insert into llm_settings (id, base_url, model, updated_at)
                values (1, ?, ?, ?)
                on conflict(id) do update set
                  base_url = excluded.base_url,
                  model = excluded.model,
                  updated_at = excluded.updated_at
                """,
                (settings.base_url, settings.model, settings.updated_at),
            )

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                create table if not exists llm_settings (
                  id integer primary key check(id = 1),
                  base_url text not null,
                  model text not null,
                  updated_at text not null
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        return connection
