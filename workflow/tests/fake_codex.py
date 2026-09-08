#!/usr/bin/env python3
"""Interactive fixture for workflow tests. Never calls a model or a network."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import termios
import time
import tomllib
import tty

if "--version" in sys.argv:
    print("codex-cli test-fixture")
    sys.exit(0)
if "features" in sys.argv:
    print("hooks stable true")
    sys.exit(0)

args = sys.argv[1:]
overrides = {}
for i, arg in enumerate(args):
    if arg == "-c":
        item = tomllib.loads(args[i + 1])
        for key, value in item.items():
            if key in overrides and isinstance(value, dict):
                overrides[key].update(value)
            else:
                overrides[key] = value
os.chdir(args[args.index("--cd") + 1])
root = Path(os.environ["BUILDERS_ROOT"])
name = os.environ["BUILDERS_WORKER"]
artifact = root / ".builders" / "workers" / name
(artifact / "fake-argv.json").write_text(json.dumps(args))
mode = re.search(r"TEST_MODE=(\w+)", args[-1])
mode = mode[1] if mode else "idle"
if mode == "trust":
    print("Do you trust the contents of this directory?\nFAKE_CODEX_READY", flush=True)
    while True:
        time.sleep(1)
session = "fake-" + name
turn = 0


def hook(event, **extra):
    if mode == "nohooks":
        return
    data = dict(cwd=os.getcwd(), session_id=session, turn_id=str(turn),
                hook_event_name=event, **extra)
    for group in overrides.get("hooks", {}).get(event, []):
        for entry in group["hooks"]:
            completed = subprocess.run(entry["command"], shell=True, input=json.dumps(data),
                                       capture_output=True, text=True, timeout=5)
            if completed.returncode:
                print(completed.stderr, flush=True)
            assert json.loads(completed.stdout) == {}, completed


def notify():
    payload = {"type": "agent-turn-complete", "thread-id": session, "turn-id": str(turn),
               "cwd": os.getcwd(), "last-assistant-message": "Fake turn finished"}
    subprocess.run(overrides["notify"] + [json.dumps(payload)], check=True)


def finish():
    hook("Stop", last_assistant_message="Fake turn finished")
    notify()


hook("SessionStart", source="resume" if "resume" in args else "startup")
hook("UserPromptSubmit", prompt=args[-1])
if mode == "crash":
    sys.exit(23)
if mode == "auto":
    Path("result.txt").write_text("Worker result\n")
    subprocess.run(["git", "add", "result.txt"], check=True)
    subprocess.run(["git", "commit", "-m", "Worker result"], check=True, capture_output=True)
    command = overrides["notify"][:overrides["notify"].index("_notify")]
    subprocess.run(command + ["report", name, "--generation", "1", "--status", "done",
                              "--summary", "Created result", "--tests", "Fixture validation"], check=True)
if mode != "busy":
    finish()
print("\x1b[?2004hFAKE_CODEX_READY", flush=True)

# Handle tmux's bracketed paste without evaluating text as shell commands.
old = termios.tcgetattr(sys.stdin)
try:
    tty.setcbreak(sys.stdin.fileno())
    buffer = b""
    while True:
        char = os.read(sys.stdin.fileno(), 1)
        if not char:
            break
        buffer += char
        if char in (b"\n", b"\r") and (b"\x1b[200~" not in buffer or b"\x1b[201~" in buffer):
            prompt = buffer.decode().replace("\x1b[200~", "").replace("\x1b[201~", "").strip()
            buffer = b""
            turn += 1
            (artifact / "fake-input.txt").write_text(prompt)
            hook("UserPromptSubmit", prompt=prompt)
            finish()
            print("FAKE_CODEX_READY", flush=True)
finally:
    termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old)
