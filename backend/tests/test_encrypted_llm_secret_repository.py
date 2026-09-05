import sqlite3
from pathlib import Path

import pytest
from cryptography.exceptions import InvalidTag

from core.adapters.persistence.sqlite_encrypted_llm_secret_repository import (
    SqliteEncryptedLlmSecretRepository,
)


def build_repository(tmp_path: Path) -> SqliteEncryptedLlmSecretRepository:
    return SqliteEncryptedLlmSecretRepository(
        database_path=tmp_path / "state.db",
        master_key_path=tmp_path / "secrets" / "llm-master.key",
    )


def test_encrypts_api_key_before_writing_database(tmp_path: Path) -> None:
    repository = build_repository(tmp_path)

    repository.save_api_key("deepseek-secret")

    with sqlite3.connect(tmp_path / "state.db") as connection:
        nonce, ciphertext = connection.execute(
            "select nonce, ciphertext from llm_secrets where id = 1"
        ).fetchone()
    assert b"deepseek-secret" not in ciphertext
    assert len(nonce) == 12
    assert repository.get_api_key() == "deepseek-secret"
    assert (tmp_path / "secrets" / "llm-master.key").stat().st_mode & 0o777 == 0o600


def test_different_writes_use_different_nonces(tmp_path: Path) -> None:
    repository = build_repository(tmp_path)
    repository.save_api_key("same-secret")
    with sqlite3.connect(tmp_path / "state.db") as connection:
        first = connection.execute(
            "select nonce, ciphertext from llm_secrets where id = 1"
        ).fetchone()

    repository.save_api_key("same-secret")
    with sqlite3.connect(tmp_path / "state.db") as connection:
        second = connection.execute(
            "select nonce, ciphertext from llm_secrets where id = 1"
        ).fetchone()

    assert first != second


def test_tampered_ciphertext_cannot_be_decrypted(tmp_path: Path) -> None:
    repository = build_repository(tmp_path)
    repository.save_api_key("deepseek-secret")
    with sqlite3.connect(tmp_path / "state.db") as connection:
        connection.execute(
            "update llm_secrets set ciphertext = ? where id = 1",
            (b"tampered",),
        )

    with pytest.raises(InvalidTag):
        repository.get_api_key()
