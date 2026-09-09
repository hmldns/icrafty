from dataclasses import replace

import pytest

from crafty_agent.config import Settings
from crafty_agent.cad_config import CadSettings


def test_agent_loop_limits_are_unlimited_unless_configured(monkeypatch, tmp_path):
    monkeypatch.setenv("CODEX_HOME", str(tmp_path))
    names = ("CRAFTY_AGENT_TURN_TIMEOUT", "CRAFTY_CAD_SECONDS", "CRAFTY_CAD_EVALUATIONS")
    for name in names:
        monkeypatch.delenv(name, raising=False)
    for value in (None, "0", "7200"):
        if value is not None:
            for name in names:
                monkeypatch.setenv(name, value)
        chat, cad = Settings.from_env(), CadSettings.from_env()
        expected = 7200 if value == "7200" else None
        assert chat.turn_timeout == cad.seconds == cad.max_evaluations == expected
        assert chat.startup_timeout == 90 and chat.cancel_timeout == 8


@pytest.mark.parametrize("value", ["-1", "nan", "inf"])
@pytest.mark.parametrize("name", ["CRAFTY_AGENT_TURN_TIMEOUT", "CRAFTY_CAD_SECONDS"])
def test_invalid_loop_deadline_is_rejected(monkeypatch, tmp_path, name, value):
    monkeypatch.setenv("CODEX_HOME", str(tmp_path))
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError, match=name):
        (Settings if name == "CRAFTY_AGENT_TURN_TIMEOUT" else CadSettings).from_env()


def test_invalid_cad_attempt_limit_is_rejected():
    with pytest.raises(ValueError, match="evaluation limit"):
        replace(CadSettings(), max_evaluations=-1)
