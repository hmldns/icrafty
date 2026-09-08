"""Explicit local runtime configuration; callers cannot set this through model code."""

from dataclasses import asdict, dataclass
import os


@dataclass(frozen=True)
class Settings:
    native_python: str = "/usr/bin/python3"
    freecad_lib: str = "/usr/lib/freecad/lib"
    font: str = "/usr/share/fonts/liberation/LiberationSans-Regular.ttf"
    wall_seconds: float = 30.0
    memory_bytes: int = 1024 * 1024 * 1024
    cpu_seconds: int = 300
    process_count: int = 32
    output_bytes: int = 128 * 1024 * 1024
    log_bytes: int = 256 * 1024
    input_bytes: int = 16 * 1024 * 1024
    max_pixels: int = 16_000_000
    cache_entries: int = 8
    cache_bytes: int = 64 * 1024 * 1024
    idle_seconds: float = 300.0
    lifetime_seconds: float = 1800.0
    tessellation_mm: float = 0.12
    title_height: int = 112
    grid_padding: int = 12
    builder_uid: int | None = None

    @classmethod
    def environment(cls) -> "Settings":
        return cls(native_python=os.environ.get("CRAFTY_NATIVE_PYTHON", cls.native_python),
                   freecad_lib=os.environ.get("CRAFTY_FREECAD_LIB", cls.freecad_lib),
                   font=os.environ.get("CRAFTY_FONT", cls.font),
                   builder_uid=65532 if os.environ.get("CRAFTY_CONTAINER") == "1" else None)

    def manifest(self) -> dict:
        return asdict(self)

    def build_settings(self) -> dict:
        return {"units": "mm", "frame": "right-handed-Z-up", "bundle_version": 1,
                "builder_version": "2"}
