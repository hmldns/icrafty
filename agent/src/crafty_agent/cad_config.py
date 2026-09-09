"""Operator-owned CAD integration settings; no launch fields come from a model."""
from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class CadSettings:
    python: Path = Path(__file__).resolve().parents[3] / "cad/.venv/bin/python"
    max_evaluations: int = 8
    seconds: float = 1200
    input_bytes: int = 16 * 1024 * 1024
    result_bytes: int = 128 * 1024 * 1024

    @classmethod
    def from_env(cls):
        value = cls(python=Path(os.environ.get("CRAFTY_CAD_PYTHON", str(cls.python))).absolute(),
                    max_evaluations=int(os.environ.get("CRAFTY_CAD_EVALUATIONS", "8")),
                    seconds=float(os.environ.get("CRAFTY_CAD_SECONDS", "1200")))
        if not 1 <= value.max_evaluations <= 32 or not 1 <= value.seconds <= 3600:
            raise ValueError("CAD budgets must be 1–32 evaluations and 1–3600 seconds")
        return value
