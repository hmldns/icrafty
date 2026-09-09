"""Operator-owned CAD integration settings; no launch fields come from a model."""
from dataclasses import dataclass
from pathlib import Path
import math
import os

from .config import optional_seconds


@dataclass(frozen=True)
class CadSettings:
    python: Path = Path(__file__).resolve().parents[3] / "cad/.venv/bin/python"
    max_evaluations: int | None = None
    seconds: float | None = None
    input_bytes: int = 16 * 1024 * 1024
    result_bytes: int = 128 * 1024 * 1024

    def __post_init__(self):
        if self.max_evaluations is not None and self.max_evaluations <= 0:
            raise ValueError("CAD evaluation limit must be positive or None (unlimited)")
        if self.seconds is not None and (not math.isfinite(self.seconds) or self.seconds <= 0):
            raise ValueError("CAD time limit must be positive or None (unlimited)")

    @classmethod
    def from_env(cls):
        return cls(python=Path(os.environ.get("CRAFTY_CAD_PYTHON", str(cls.python))).absolute(),
                   max_evaluations=int(os.environ.get("CRAFTY_CAD_EVALUATIONS", "0")) or None,
                   seconds=optional_seconds("CRAFTY_CAD_SECONDS"))
