from pathlib import Path

from core.infra.setup import default_state_path


def test_default_state_path_uses_host_configured_path(
    monkeypatch,
    tmp_path: Path,
) -> None:
    configured_path = tmp_path / "piano" / "app.db"
    monkeypatch.setenv("PIANO_STATE_PATH", str(configured_path))

    assert default_state_path() == configured_path
