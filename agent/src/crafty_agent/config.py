"""Operator configuration, never model/browser-supplied launch parameters."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import math
import os
import shutil
import tomllib


def optional_seconds(name: str) -> float | None:
    value = float(os.environ.get(name, "0"))
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be zero (unlimited) or a positive number of seconds")
    return value or None


@dataclass(frozen=True)
class Settings:
    data: Path
    adapter: tuple[str, ...]
    auth_source: Path | None
    codex_path: str | None = None
    model: str | None = None
    reasoning: str | None = None
    codex_transport: str = "https"
    startup_timeout: float = 90
    turn_timeout: float | None = None
    cancel_timeout: float = 8
    max_image_bytes: int = 20 * 1024 * 1024
    max_pixels: int = 25_000_000
    max_frame_bytes: int = 48 * 1024 * 1024
    origins: tuple[str, ...] = tuple(f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5187, 5217, 5287, 5317, 4187, 4217))

    def __post_init__(self):
        if min(self.startup_timeout, self.cancel_timeout, self.max_image_bytes, self.max_pixels, self.max_frame_bytes) <= 0:
            raise ValueError("Agent time and size limits must be positive")
        if self.turn_timeout is not None and (not math.isfinite(self.turn_timeout) or self.turn_timeout <= 0):
            raise ValueError("Agent turn timeout must be positive or None (unlimited)")
        if self.codex_transport not in {"https", "auto"}:
            raise ValueError("CRAFTY_CODEX_TRANSPORT must be https or auto")

    def runtime_config(self, *, image_generation: bool) -> dict:
        config = {"features": {"image_generation": image_generation, "apps": False, "multi_agent": False}}
        if self.model:
            config["model"] = self.model
        if self.reasoning:
            config["model_reasoning_effort"] = self.reasoning
        if self.codex_transport == "https":
            # Built-in provider IDs are reserved. Use the same OpenAI auth/default
            # endpoint with streaming HTTPS, avoiding repeated WebSocket fallback.
            provider = "crafty-openai-https"
            config.update(model_provider=provider, model_providers={provider: {
                "name": "OpenAI", "wire_api": "responses", "requires_openai_auth": True,
                "supports_websockets": False,
            }})
        return config

    @classmethod
    def from_env(cls) -> Settings:
        root = Path(__file__).resolve().parents[2]
        operator_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
        preferences = {}
        try:
            preferences = tomllib.loads((operator_home / "config.toml").read_text())
        except (OSError, tomllib.TOMLDecodeError):
            pass
        local = root / "node_modules/.bin/codex-acp"
        command = os.environ.get("CRAFTY_ACP_COMMAND")
        configured = json.loads(command) if command else [str(local) if local.exists() else shutil.which("codex-acp") or "codex-acp"]
        if not isinstance(configured, list) or not configured or not all(isinstance(arg, str) and arg for arg in configured):
            raise ValueError("CRAFTY_ACP_COMMAND must be a JSON array of command arguments")
        return cls(
            data=Path(os.environ.get("CRAFTY_AGENT_DATA", str(root / ".state"))).expanduser().resolve(),
            adapter=tuple(configured),
            auth_source=Path(os.environ.get("CRAFTY_CODEX_AUTH_SOURCE", str(operator_home / "auth.json"))).expanduser(),
            codex_path=os.environ.get("CRAFTY_CODEX_PATH"),
            model=os.environ.get("CRAFTY_AGENT_MODEL") or preferences.get("model"),
            reasoning=os.environ.get("CRAFTY_AGENT_REASONING") or preferences.get("model_reasoning_effort"),
            codex_transport=os.environ.get("CRAFTY_CODEX_TRANSPORT", "https"),
            startup_timeout=float(os.environ.get("CRAFTY_AGENT_STARTUP_TIMEOUT", "90")),
            turn_timeout=optional_seconds("CRAFTY_AGENT_TURN_TIMEOUT"),
            cancel_timeout=float(os.environ.get("CRAFTY_AGENT_CANCEL_TIMEOUT", "8")),
            max_image_bytes=int(os.environ.get("CRAFTY_AGENT_IMAGE_LIMIT", str(20 * 1024 * 1024))),
            max_pixels=int(os.environ.get("CRAFTY_AGENT_PIXEL_LIMIT", "25000000")),
            max_frame_bytes=int(os.environ.get("CRAFTY_AGENT_FRAME_LIMIT", str(48 * 1024 * 1024))),
            origins=tuple(value.strip() for value in os.environ["CRAFTY_AGENT_ORIGINS"].split(",")) if "CRAFTY_AGENT_ORIGINS" in os.environ else cls.origins,
        )
