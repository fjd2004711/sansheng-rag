from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _backend_command(compose: str) -> str:
    return next(
        line.strip()
        for line in (ROOT / compose).read_text().splitlines()
        if "uvicorn app.main:app" in line
    )


def test_prod_compose_uses_sansio_websockets() -> None:
    assert "--ws websockets-sansio" in _backend_command("docker-compose.prod.yml")


def test_prod_compose_has_no_reload_and_single_worker() -> None:
    command = _backend_command("docker-compose.prod.yml")
    assert "--reload" not in command
    # Rate limits, flow settings and report slots live in process memory.
    assert "--workers 1" in command
