"""Small fixture assertion context; implementation belongs to tests/."""

from dataclasses import dataclass
from pathlib import Path
import shutil
import threading

from ..files import atomic_json, load_json
from ..runtime import GeometryRuntime
from ..settings import Settings


CAD_ROOT = Path(__file__).resolve().parents[3]


@dataclass
class Case:
    suite: str
    name: str
    run: object
    classification: str = "expected_good"
    native: bool = True


class Context:
    def __init__(self, root: Path, settings: Settings, cancel: threading.Event, phase):
        self.root, self.settings, self.cancel, self.phase = root, settings, cancel, phase
        root.mkdir(parents=True)
        self.assertions = []
        self.results = []
        self.runtimes = []
        self.serial = 0

    def expect(self, condition, message, expected=None, actual=None):
        self.assertions.append({"passed": bool(condition), "message": message, "expected": expected, "actual": actual})
        if not condition:
            raise AssertionError(message + (f"; expected {expected!r}, actual {actual!r}" if expected is not None else ""))

    def runtime(self, settings=None, fault=None):
        runtime = GeometryRuntime(self.root / f"runtime-{len(self.runtimes)}", settings or self.settings, fault)
        self.runtimes.append(runtime)
        return runtime

    def input(self, fixture: str, parameters=None):
        folder = self.root / ("input-" + fixture)
        folder.mkdir(exist_ok=True)
        path = CAD_ROOT / "fixtures" / fixture / "model.py"
        if fixture == "cylinder":
            path = CAD_ROOT / "examples" / "cylinder" / "model.py"
        shutil.copyfile(path, folder / "model.py")
        request = {"schema_version": 1, "source": "model.py", "parameters": parameters or {},
                   "inputs": {}, "outputs": [], "metrics": []}
        if fixture == "cylinder":
            request["parameters"] = parameters or {"radius_mm": 10, "height_mm": 20}
        return folder, request

    def evaluate(self, runtime, folder, request, name=None):
        self.serial += 1
        name = name or f"evaluation-{self.serial}"
        request_path = folder / f"{name}.json"
        atomic_json(request_path, request)
        self.phase("evaluate " + name)
        result_path, code = runtime.evaluate(request_path, self.root / name, cancel=self.cancel)
        self.results.append(result_path)
        return load_json(result_path), code

    def close(self):
        for runtime in self.runtimes:
            runtime.close()
