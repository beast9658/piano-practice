import os
import sqlite3
import threading
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


_ENCRYPTION_VERSION = 1
_AAD = b"piano:llm-api-key:v1"


class SqliteEncryptedLlmSecretRepository:
    def __init__(self, database_path: Path, master_key_path: Path) -> None:
        self._database_path = database_path
        self._master_key_path = master_key_path
        self._lock = threading.RLock()
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        self._master_key_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def has_api_key(self) -> bool:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "select 1 from llm_secrets where id = 1"
            ).fetchone()
        return row is not None

    def save_api_key(self, api_key: str) -> None:
        secret = api_key.strip()
        if not secret:
            raise ValueError("API Key cannot be empty")
        master_key = self._load_or_create_master_key()
        nonce = os.urandom(12)
        ciphertext = AESGCM(master_key).encrypt(nonce, secret.encode("utf-8"), _AAD)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                insert into llm_secrets (id, version, nonce, ciphertext)
                values (1, ?, ?, ?)
                on conflict(id) do update set
                  version = excluded.version,
                  nonce = excluded.nonce,
                  ciphertext = excluded.ciphertext
                """,
                (_ENCRYPTION_VERSION, nonce, ciphertext),
            )

    def get_api_key(self) -> str | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "select version, nonce, ciphertext from llm_secrets where id = 1"
            ).fetchone()
        if row is None:
            return None
        if int(row["version"]) != _ENCRYPTION_VERSION:
            raise ValueError("unsupported LLM secret encryption version")
        master_key = self._read_master_key()
        plaintext = AESGCM(master_key).decrypt(
            bytes(row["nonce"]),
            bytes(row["ciphertext"]),
            _AAD,
        )
        return plaintext.decode("utf-8")

    def delete_api_key(self) -> None:
        with self._lock, self._connect() as connection:
            connection.execute("delete from llm_secrets where id = 1")

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                create table if not exists llm_secrets (
                  id integer primary key check(id = 1),
                  version integer not null,
                  nonce blob not null,
                  ciphertext blob not null
                )
                """
            )

    def _load_or_create_master_key(self) -> bytes:
        if self._master_key_path.exists():
            return self._read_master_key()
        key = AESGCM.generate_key(bit_length=256)
        try:
            descriptor = os.open(
                self._master_key_path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
        except FileExistsError:
            return self._read_master_key()
        with os.fdopen(descriptor, "wb") as file:
            file.write(key)
            file.flush()
            os.fsync(file.fileno())
        return key

    def _read_master_key(self) -> bytes:
        try:
            key = self._master_key_path.read_bytes()
        except FileNotFoundError as error:
            raise ValueError("LLM master key file is missing") from error
        if len(key) != 32:
            raise ValueError("LLM master key file is invalid")
        return key

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._database_path)
        connection.row_factory = sqlite3.Row
        return connection
