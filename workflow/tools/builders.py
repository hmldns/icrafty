#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Project-local, interactive Codex workers in Git worktrees and tmux."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import fnmatch
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
import time
import uuid


SCRIPT = Path(__file__).resolve()
ROLE_GUIDE = SCRIPT.parents[1] / "ROLES.md"
HOOKS = ("SessionStart", "UserPromptSubmit", "PermissionRequest", "Stop",
         "Interrupt", "SessionEnd")
FINAL = {"done", "blocked", "error", "stopped", "merged"}


class Error(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def run(argv, cwd=None, check=True, input=None, timeout=30):
    result = subprocess.run([str(a) for a in argv], cwd=cwd, input=input,
                            text=True, capture_output=True, timeout=timeout)
    if check and result.returncode:
        raise Error(result.stderr.strip() or result.stdout.strip()
                    or f"Command failed: {shlex.join(map(str, argv))}")
    return result


def git(root, *args, check=True):
    return run(["git", "-C", root, *args], check=check)


def emit(value):
    print(json.dumps(value, indent=2, ensure_ascii=False), flush=True)


def valid_name(value):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", value):
        raise Error("Names must contain 1–64 letters, digits, underscores or hyphens.")
    return value


def validate_scope(scope):
    if any(not s.strip() or Path(s).is_absolute() or ".." in Path(s).parts for s in scope):
        raise Error("Scope entries must be nonempty paths or globs relative to the worktree.")


def validate_direction(text):
    if any(ord(c) < 32 and c not in "\n\t" for c in text) or "\x7f" in text:
        raise Error("Steering text must not contain terminal control characters.")


def text_arg(args, field="prompt"):
    value = getattr(args, field, None)
    path = getattr(args, f"{field}_file", None)
    if path:
        value = Path(path).read_text()
    if not value or not value.strip():
        raise Error(f"Provide --{field} or --{field}-file with nonempty text.")
    return value


def toml(value):
    """Encode the small TOML subset accepted by Codex -c overrides."""
    if isinstance(value, dict):
        return "{" + ", ".join(f"{k} = {toml(v)}" for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "[" + ", ".join(toml(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


def discover_root(explicit=None, cwd=None):
    if explicit:
        return Path(explicit).resolve()
    # Git's common directory is shared by all linked worker worktrees.
    common = git(cwd or Path.cwd(), "rev-parse", "--path-format=absolute",
                 "--git-common-dir").stdout.strip()
    root = Path(common).parent
    if not (root / ".git").is_dir():
        raise Error("Use --root with the main checkout (bare repositories are unsupported).")
    return root


class Project:
    def __init__(self, root, require=True):
        self.root = Path(root).resolve()
        self.state = self.root / ".builders"
        self.config_path = self.state / "config.json"
        self.db_path = self.state / "state.sqlite3"
        self.config = {}
        if self.config_path.exists():
            self.config = json.loads(self.config_path.read_text())
        elif require:
            raise Error("Run ./workflow/builders init in the director checkout first.")

    @contextmanager
    def db(self):
        conn = sqlite3.connect(self.db_path, timeout=2)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    @contextmanager
    def lock(self):
        # Serialize director mutations, without blocking worker event writers.
        with (self.state / "director.lock").open("a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            yield

    def worker(self, name, db=None):
        if db is None:
            with self.db() as conn:
                return self.worker(name, conn)
        row = db.execute("SELECT data FROM workers WHERE name=?", (name,)).fetchone()
        if not row:
            raise Error(f"Unknown worker: {name}")
        return json.loads(row[0])

    def workers(self):
        with self.db() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT data FROM workers ORDER BY name")]

    def save(self, db, worker):
        worker["updated_at"] = now()
        db.execute("INSERT INTO workers(name,data) VALUES (?,?) "
                   "ON CONFLICT(name) DO UPDATE SET data=excluded.data",
                   (worker["name"], json.dumps(worker)))

    def event(self, db, worker, kind, payload=None, attention=False):
        return db.execute("INSERT INTO events(at,worker,generation,kind,payload,attention) "
                          "VALUES (?,?,?,?,?,?)", (now(), worker["name"], worker["generation"],
                          kind, json.dumps(payload or {}), int(attention))).lastrowid

    def tmux(self, *args, **kwargs):
        cmd = ["tmux"]
        if self.config.get("socket"):
            cmd += ["-L", self.config["socket"]]
        return run(cmd + list(args), **kwargs)

    def entrypoint(self):
        uv = shutil.which("uv")
        if not uv:
            raise Error("uv is required to run the inline-dependency script.")
        return [uv, "run", "--cache-dir", str(self.state / "uv-cache"), "--script",
                str(SCRIPT), "--root", str(self.root)]

    def panes(self):
        result = self.tmux("list-panes", "-a", "-F",
                           "#{pane_id}\t#{window_id}\t#{session_name}\t#{pane_dead}"
                           "\t#{pane_dead_status}\t#{@builders_root}\t#{@builders_worker}",
                           check=False)
        if result.returncode:
            if any(s in result.stderr for s in ("no server running", "No such file or directory")):
                return {}
            raise Error(result.stderr.strip())
        return {fields[0]: dict(zip(("pane", "window", "session", "dead", "exit_code", "root", "worker"), fields))
                for line in result.stdout.splitlines() if len(fields := line.split("\t")) == 7}

    def owned_pane(self, w, live=True):
        pane = self.panes().get(w.get("pane"))
        if not pane or pane["root"] != str(self.root) or pane["worker"] != w["name"]:
            raise Error(f"Worker {w['name']} no longer has its registered tmux pane.")
        if live and pane["dead"] == "1":
            raise Error(f"Worker {w['name']} exited; use restart.")
        return pane

    def ensure_session(self):
        session = self.config["session"]
        watch = shlex.join(self.entrypoint() + ["watch"])
        exists = self.tmux("has-session", "-t", f"={session}", check=False)
        if exists.returncode:
            if not any(s in exists.stderr for s in ("can't find session", "no server running", "No such file or directory")):
                raise Error(exists.stderr.strip())
            pane = self.tmux("new-session", "-d", "-P", "-F", "#{pane_id}", "-s", session,
                             "-n", "monitor", "-c", self.root, watch).stdout.strip()
        else:
            monitor = None
            listed = self.tmux("list-panes", "-s", "-t", f"={session}", "-F",
                               "#{pane_id}\t#{@builders_monitor}\t#{pane_dead}")
            for line in listed.stdout.splitlines():
                fields = line.split("\t")
                if len(fields) == 3 and fields[1] == str(self.root):
                    monitor = fields
                    break
            if monitor:
                pane = monitor[0]
                if monitor[2] == "1":
                    self.tmux("respawn-pane", "-t", pane, "-c", self.root, watch)
            else:
                pane = self.tmux("new-window", "-d", "-P", "-F", "#{pane_id}", "-t", f"{session}:",
                                 "-n", "monitor", "-c", self.root, watch).stdout.strip()
        self.tmux("set-option", "-p", "-t", pane, "@builders_monitor", self.root)
        self.tmux("set-option", "-w", "-t", pane, "remain-on-exit", "on")
        self.tmux("set-option", "-w", "-t", pane, "automatic-rename", "off")
        return session

    def prompt(self, w, task):
        command = shlex.join(self.entrypoint() + ["report", w["name"], "--generation", str(w["generation"])])
        return f"""You are worker {w['name']}, role: {w['role']}.
Your director coordinates the project in {self.root}.
Your ONLY working checkout: {w['worktree']}
Your branch: {w['branch']}; assignment generation: {w['generation']}.
Owned paths (directory prefixes or globs): {', '.join(w['scope'])}
Before starting and after compaction, read both:
- Shared project context and conventions: {self.root / 'AGENTS.md'}
- Role-based process: {ROLE_GUIDE} (follow the Worker section)

Assignment:
{task}

Reporting command (use the status and timing specified in the role guide):
{command} --status done --summary 'What changed' --tests 'Commands and outcomes'
Other report statuses: progress, blocked, error.
Your full assignment is also saved at {self.state / 'workers' / w['name'] / 'assignment.md'}.
"""

    def write_assignment(self, w, task):
        directory = self.state / "workers" / w["name"]
        directory.mkdir(parents=True, exist_ok=True)
        prompt = self.prompt(w, task)
        (directory / "assignment.md").write_text(prompt)
        (directory / f"assignment-{w['generation']}.md").write_text(prompt)
        return prompt

    def command(self, w):
        notify = self.entrypoint() + ["_notify", w["name"], str(w["run_id"])]
        hook = shlex.join(self.entrypoint() + ["_hook"])
        command = [self.config["codex_bin"], "--cd", w["worktree"],
                   "--sandbox", "workspace-write", "--ask-for-approval", "on-request",
                   "--add-dir", str(self.state), "--add-dir", self.config["git_common"],
                   "--no-alt-screen", "-c", "notify=" + toml(notify)]
        if self.config["hooks"]:
            command += ["-c", "features.hooks=true"]
            for event in HOOKS:
                command += ["-c", f"hooks.{event}=" + toml([
                    {"hooks": [{"type": "command", "command": hook, "timeout": 3}]}])]
        if w.get("thread_id") and (w.get("thread_id_source") == "hook" or w.get("hooks_seen")):
            command += ["resume", w["thread_id"]]
        command.append((self.state / "workers" / w["name"] / "assignment.md").read_text())
        return command

    def start_pane(self, w, existing=None):
        session = self.ensure_session()
        # Start with a waiting supervisor. Tag the pane before allowing Codex to run.
        command = shlex.join(self.entrypoint() + ["_run", w["name"], w["run_id"]])
        if existing:
            pane, window = existing["pane"], existing["window"]
            self.tmux("respawn-pane", "-k", "-t", pane, "-c", w["worktree"], command)
        else:
            pane, window = self.tmux("new-window", "-d", "-P", "-F", "#{pane_id}\t#{window_id}",
                                     "-t", f"{session}:", "-n", w["name"], "-c", w["worktree"],
                                     command).stdout.strip().split("\t")
        self.tmux("set-option", "-w", "-t", window, "remain-on-exit", "on")
        self.tmux("set-option", "-w", "-t", window, "automatic-rename", "off")
        self.tmux("set-option", "-p", "-t", pane, "@builders_root", self.root)
        self.tmux("set-option", "-p", "-t", pane, "@builders_worker", w["name"])
        with self.db() as db:
            current = self.worker(w["name"], db)
            current.update(pane=pane, window=window, launch_ready=True, alive=True)
            self.save(db, current)
            self.event(db, current, "launched", {"pane": pane, "worktree": w["worktree"]})
        return current

    def scan(self):
        panes = self.panes()
        hints = {}
        # Startup and untrusted-hook pauses may happen before any callback exists.
        # UI hints only request attention; they never declare completion or approve.
        for w in self.workers():
            pane = panes.get(w.get("pane"))
            if not w.get("alive") or not pane or pane["dead"] == "1":
                continue
            if pane["root"] != str(self.root) or pane["worker"] != w["name"]:
                continue
            screen = self.tmux("capture-pane", "-p", "-t", pane["pane"], check=False).stdout
            for phrase, hint in (
                ("Do you trust the contents of this directory?", "Project trust prompt"),
                ("Sign in with ChatGPT", "Codex sign-in prompt"),
                ("Would you like to run the following command?", "Command approval prompt"),
            ):
                if phrase in screen:
                    hints[w["name"]] = hint
                    break
        with self.db() as db:
            rows = list(db.execute("SELECT data FROM workers"))
            for row in rows:
                w = json.loads(row[0])
                if not w.get("launch_ready") or w.get("alive") is False:
                    continue
                hint = hints.get(w["name"])
                if hint and w.get("screen_hint") != hint:
                    w["screen_hint"] = hint
                    p_state = w["status"]
                    if p_state not in FINAL and p_state != "merging":
                        w["status"] = "needs_input"
                    self.save(db, w)
                    self.event(db, w, "needs_input", {"reason": hint, "pane": w["pane"]}, attention=True)
                elif not hint and w.get("screen_hint"):
                    w.pop("screen_hint")
                    if w["status"] == "needs_input":
                        w["status"] = "running"
                    self.save(db, w)
                p = panes.get(w.get("pane"))
                missing = not p or p["root"] != str(self.root) or p["worker"] != w["name"]
                if missing or p["dead"] == "1":
                    w["alive"] = False
                    if w["status"] not in FINAL:
                        w["status"] = "error"
                    reason = "Registered pane vanished" if missing else "Worker process exited"
                    self.save(db, w)
                    self.event(db, w, "exited", {"reason": reason,
                               "exit_code": p["exit_code"] if p else None}, attention=True)
        return self.workers()

    def events(self, after=None, consumer="director", all_events=False):
        with self.db() as db:
            if after is None:
                row = db.execute("SELECT event_id FROM cursors WHERE name=?", (consumer,)).fetchone()
                after = row[0] if row else 0
            query = "SELECT * FROM events WHERE id>?"
            if not all_events:
                query += " AND attention=1"
            rows = list(db.execute(query + " ORDER BY id LIMIT 100", (after,)))
            return [dict(r) | {"payload": json.loads(r["payload"])} for r in rows]


def initialize(p, args):
    p.state.mkdir(exist_ok=True)
    with p.lock():
        if p.config:
            emit(p.config)
            return
        git(p.root, "rev-parse", "--is-inside-work-tree")
        branch = git(p.root, "symbolic-ref", "--short", "HEAD").stdout.strip()
        executable = shutil.which(args.codex_bin)
        if not executable:
            raise Error(f"Codex executable not found: {args.codex_bin}")
        if not shutil.which("tmux"):
            raise Error("tmux is required.")
        p.entrypoint()
        if not (p.root / "AGENTS.md").is_file():
            raise Error("Create a project AGENTS.md before initializing workers.")
        p.config = dict(version=1, root=str(p.root), session=valid_name(args.session),
                        socket=valid_name(args.socket) if args.socket else None,
                        codex_bin=str(Path(executable).absolute()), hooks=not args.no_hooks,
                        director_branch=branch,
                        git_common=git(p.root, "rev-parse", "--path-format=absolute",
                                       "--git-common-dir").stdout.strip())
        with p.db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS workers(name TEXT PRIMARY KEY, data TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, "
                       "at TEXT NOT NULL, worker TEXT NOT NULL, generation INTEGER NOT NULL, "
                       "kind TEXT NOT NULL, payload TEXT NOT NULL, attention INTEGER NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS cursors(name TEXT PRIMARY KEY, event_id INTEGER NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS seen(key TEXT PRIMARY KEY)")
        # The common exclude file applies to linked worktrees, without touching global Git config.
        exclude = Path(p.config["git_common"]) / "info" / "exclude"
        exclude.parent.mkdir(exist_ok=True)
        existing = exclude.read_text() if exclude.exists() else ""
        patterns = ["/.builders/", "/.worktrees/", "/AGENTS.override.md"]
        with exclude.open("a") as stream:
            stream.write("\n" + "\n".join(s for s in patterns if s not in existing.splitlines()) + "\n")
        p.config_path.write_text(json.dumps(p.config, indent=2) + "\n")
    emit(p.config)


def launch(p, args):
    name = valid_name(args.name)
    task = text_arg(args)
    validate_scope(args.scope)
    if not args.role.strip():
        raise Error("Worker role must be nonempty.")
    if not ROLE_GUIDE.is_file():
        raise Error(f"Missing role guide: {ROLE_GUIDE}. Keep the workflow folder together.")
    with p.lock():
        if any(w["name"] == name for w in p.workers()):
            raise Error(f"Worker {name} already exists. Use steer, assign, or restart.")
        base_result = git(p.root, "rev-parse", "--verify", "HEAD^{commit}", check=False)
        if base_result.returncode:
            raise Error("Git worktrees need a first commit. Commit the project baseline, then launch.")
        if git(p.root, "cat-file", "-e", "HEAD:AGENTS.override.md", check=False).returncode == 0:
            raise Error("This project already tracks AGENTS.override.md; consolidate it into AGENTS.md first.")
        p.ensure_session()
        worktree = p.root / ".worktrees" / name
        branch = f"builders/{p.config['session']}/{name}"
        worktree.parent.mkdir(exist_ok=True)
        git(p.root, "worktree", "add", "-b", branch, worktree, base_result.stdout.strip())
        override = worktree / "AGENTS.override.md"
        if override.exists() or override.is_symlink():
            raise Error(f"{override} already exists; retained the worktree for inspection.")
        override.symlink_to(p.root / "AGENTS.md")
        w = dict(name=name, role=args.role, scope=args.scope, task=task, branch=branch,
                 worktree=str(worktree), base=base_result.stdout.strip(), generation=1,
                 status="starting", pane=None, window=None, launch_ready=False,
                 alive=False, thread_id=None, reported_commit=None, report=None,
                 run_id=uuid.uuid4().hex, created_at=now())
        p.write_assignment(w, task)
        with p.db() as db:
            p.save(db, w)
        try:
            w = p.start_pane(w)
        except (Error, OSError) as exc:
            with p.db() as db:
                w = p.worker(name, db)
                w["status"] = "error"
                p.save(db, w)
                p.event(db, w, "launch_failed", {"error": str(exc)}, attention=True)
            raise
    emit(w)


def supervise(p, args):
    deadline = time.monotonic() + 15
    while True:
        w = p.worker(args.name)
        if w["run_id"] != args.run_id:
            return
        if w["launch_ready"]:
            break
        if time.monotonic() >= deadline:
            raise Error("Timed out waiting for tmux pane registration.")
        time.sleep(0.05)
    with p.db() as db:
        w = p.worker(args.name, db)
        w["status"] = "running"
        p.save(db, w)
    env = os.environ.copy()
    env.update(BUILDERS_ROOT=str(p.root), BUILDERS_WORKER=w["name"], BUILDERS_RUN_ID=w["run_id"])
    try:
        code = subprocess.call(p.command(w), cwd=w["worktree"], env=env)
    except OSError as exc:
        print(str(exc), file=sys.stderr)
        code = 127
    with p.db() as db:
        current = p.worker(w["name"], db)
        if current["run_id"] == w["run_id"]:
            already_exited = current.get("alive") is False
            current.update(alive=False, exit_code=code)
            if current["status"] not in FINAL:
                current["status"] = "error" if code else "stopped"
            p.save(db, current)
            if not already_exited:
                p.event(db, current, "exited", {"exit_code": code}, attention=True)
    return code


def lifecycle(p, payload, name=None, run_id=None):
    notification = name is not None
    if notification:
        if payload.get("type") != "agent-turn-complete":
            return {}
        event = "Stop"
        session, turn = payload.get("thread-id"), payload.get("turn-id")
    else:
        event = payload.get("hook_event_name")
        # Native child hooks can use the parent's session_id; their agent_id
        # distinguishes them. Internal sessions do not run root start hooks.
        if event not in HOOKS or payload.get("agent_id"):
            return {}
        session, turn = payload.get("session_id"), payload.get("turn_id")
    if not isinstance(session, str) or not session or not payload.get("cwd"):
        return {}
    cwd = Path(payload["cwd"]).resolve()
    if not notification:
        matches = [w for w in p.workers() if Path(w["worktree"]) == cwd]
        if not matches:
            return {}
        name = matches[0]["name"]
        run_id = os.environ.get("BUILDERS_RUN_ID")
    with p.db() as db:
        w = p.worker(name, db)
        if cwd != Path(w["worktree"]) or (run_id and run_id != w["run_id"]):
            return {}
        verified = w.get("thread_id_source") == "hook" or bool(w.get("hooks_seen"))
        if verified and w.get("thread_id") != session:
            return {}  # Do not ingest nested agents or a stale resumed process.
        if notification and not verified:
            # Legacy notify has no parent/source discriminator: title generation
            # can arrive first. Wake the director without claiming identity or idle.
            event = "notification"
        elif not notification:
            if w.get("thread_id") and w["thread_id"] != session:
                # Recover pre-provenance state written by an early child notify.
                w.pop("last_turn", None)
                if w["status"] == "idle":
                    w["status"] = "running"
            w.update(thread_id=session, thread_id_source="hook", hooks_seen=True)
            verified = True
        if turn and event in {"Stop", "UserPromptSubmit", "Interrupt", "notification"}:
            key = f"{name}:{w['run_id']}:{session}:{turn}:{event}"
            if db.execute("INSERT OR IGNORE INTO seen VALUES (?)", (key,)).rowcount == 0:
                return {}
        attention = False
        data = {"thread_id": session, "turn_id": turn,
                "source": "notify" if notification else "hook", "verified": verified}
        if event == "notification":
            data["summary"] = payload.get("last-assistant-message")
            data["input_messages"] = payload.get("input-messages")
            p.event(db, w, event, data, attention=True)
            return {}
        if event == "SessionStart":
            data["start_source"] = payload.get("source")
        elif event == "UserPromptSubmit":
            # A user can direct a worker in its TUI; invalidate old completion immediately.
            w.update(status="running", reported_commit=None, report=None)
            data["prompt"] = str(payload.get("prompt", ""))[:16000]
            # Launching our own assignment must not immediately wake the director.
            attention = bool(w.get("seen_prompt"))
            w["seen_prompt"] = True
        elif event == "PermissionRequest":
            w["status"] = "needs_approval"
            data["tool"] = payload.get("tool_name")
            data["input"] = payload.get("tool_input")
            attention = True
        elif event == "Stop":
            data["summary"] = payload.get("last_assistant_message", payload.get("last-assistant-message"))
            data["input_messages"] = payload.get("input-messages")
            if w["status"] not in FINAL and w["status"] != "merging":
                w["status"] = "idle"
                attention = True
            w["last_turn"] = data
        elif event == "Interrupt":
            if w["status"] not in FINAL:
                w["status"] = "idle"
            attention = True
        elif event == "SessionEnd":
            attention = True
        else:
            return {}
        p.save(db, w)
        p.event(db, w, event, data, attention=attention)
    # Advisory hooks only. Never approve tools, reject prompts, or force continuation.
    return {}


def snapshot(w):
    tree = w["worktree"]
    head = git(tree, "rev-parse", "HEAD").stdout.strip()
    branch = git(tree, "symbolic-ref", "--short", "HEAD").stdout.strip()
    if branch != w["branch"]:
        raise Error(f"Worker checked out {branch}, expected {w['branch']}.")
    if git(tree, "merge-base", "--is-ancestor", w["base"], head, check=False).returncode:
        raise Error("Worker history no longer descends from its assignment base.")
    dirty = git(tree, "status", "--porcelain", "--untracked-files=all").stdout
    files = git(tree, "diff", "--name-only", "--no-renames", "-z", w["base"], head).stdout.split("\0")
    files = [s for s in files if s]
    outside = [path for path in files if not any(
        path == pattern.rstrip("/") or path.startswith(pattern.rstrip("/") + "/")
        or fnmatch.fnmatchcase(path, pattern) for pattern in w["scope"])]
    return dict(commit=head, dirty=dirty, files=files, outside_scope=outside)


def report(p, args):
    if not args.summary.strip():
        raise Error("A report needs a nonempty summary.")
    w = p.worker(args.name)
    if args.generation != w["generation"]:
        raise Error("Stale assignment generation; read the current assignment.md.")
    snap = snapshot(w)
    if args.status == "done" and snap["dirty"]:
        raise Error("Commit the worker changes before reporting done; use blocked if Git cannot commit.")
    data = dict(summary=args.summary, tests=args.tests, **snap)
    with p.db() as db:
        w = p.worker(args.name, db)
        if args.generation != w["generation"] or w["status"] in {"merging", "merged"}:
            raise Error("Assignment changed or is already integrating; ask the director for a new assignment.")
        w["report"] = data
        w["reported_commit"] = snap["commit"] if args.status == "done" else None
        w["status"] = "running" if args.status == "progress" else args.status
        p.save(db, w)
        event_id = p.event(db, w, args.status, data, attention=True)
    emit({"event_id": event_id, "worker": args.name, "status": args.status, **data})


def paste(p, w, text):
    p.owned_pane(w)
    validate_direction(text)
    buffer = "builders-" + uuid.uuid4().hex
    p.tmux("load-buffer", "-b", buffer, "-", input=text)
    try:
        p.tmux("paste-buffer", "-p", "-d", "-b", buffer, "-t", w["pane"])
        p.tmux("send-keys", "-t", w["pane"], "Enter")
    finally:
        p.tmux("delete-buffer", "-b", buffer, check=False)


def steer(p, args):
    text = text_arg(args)
    validate_direction(text)
    with p.lock():
        w = p.worker(args.name)
        if w["status"] in {"merging", "merged"}:
            raise Error("Use assign after integration to start the next assignment.")
        p.owned_pane(w)
        with p.db() as db:
            w = p.worker(args.name, db)
            w.update(status="running", reported_commit=None, report=None)
            p.save(db, w)
            p.event(db, w, "steered", {"prompt": text}, attention=True)
        paste(p, w, f"Director direction for {w['name']} (generation {w['generation']}):\n{text}")
    emit({"worker": w["name"], "delivered": True})


def assign(p, args):
    task = text_arg(args)
    validate_direction(task)
    if args.scope:
        validate_scope(args.scope)
    with p.lock():
        w = p.worker(args.name)
        if w["status"] != "merged":
            raise Error("Integrate this worker before assigning its next task; use steer for revisions.")
        if snapshot(w)["dirty"]:
            raise Error("Worker worktree is dirty.")
        p.owned_pane(w)
        base = git(p.root, "rev-parse", "HEAD").stdout.strip()
        git(w["worktree"], "merge", "--ff-only", base)
        with p.db() as db:
            w = p.worker(args.name, db)
            w.update(generation=w["generation"] + 1, base=base, task=task,
                     status="running", reported_commit=None, report=None)
            if args.scope:
                w["scope"] = args.scope
            p.save(db, w)
            p.event(db, w, "assigned", {"task": task})
        paste(p, w, p.write_assignment(w, task))
    emit(w)


def integrate(p, args):
    with p.lock():
        w = p.worker(args.name)
        if w["status"] != "done" or not w.get("reported_commit"):
            raise Error("A worker must report done before integration.")
        snap = snapshot(w)
        if snap["dirty"] or snap["commit"] != w["reported_commit"]:
            raise Error("Worker changed after reporting; request a fresh commit and done report.")
        if snap["outside_scope"] and not args.allow_outside_scope:
            raise Error("Changes outside assigned scope: " + ", ".join(snap["outside_scope"]))
        branch = git(p.root, "symbolic-ref", "--short", "HEAD").stdout.strip()
        if branch != p.config["director_branch"]:
            raise Error(f"Integration requires director branch {p.config['director_branch']}.")
        if git(p.root, "status", "--porcelain").stdout:
            raise Error("The director checkout must be clean before integration.")
        with p.db() as db:
            current = p.worker(args.name, db)
            if current["reported_commit"] != snap["commit"] or current["status"] != "done":
                raise Error("Worker state changed during preflight; review again.")
            current["status"] = "merging"
            p.save(db, current)
        result = git(p.root, "merge", "--no-ff", "--no-edit", snap["commit"], check=False)
        with p.db() as db:
            current = p.worker(args.name, db)
            if result.returncode:
                if current["status"] == "merging":
                    current["status"] = "done"
                p.event(db, current, "merge_failed", {"stdout": result.stdout, "stderr": result.stderr}, attention=True)
            else:
                current["integrated_commit"] = snap["commit"]
                current["integration_head"] = git(p.root, "rev-parse", "HEAD").stdout.strip()
                if current["status"] == "merging":
                    current["status"] = "merged"
                p.event(db, current, "merged", {"commit": snap["commit"], "head": current["integration_head"]})
            p.save(db, current)
        if result.returncode:
            raise Error("Merge stopped. Resolve and commit in the director checkout, or run git merge --abort. "
                        "Then retry builders merge.\n" + result.stdout + result.stderr)
    emit(current)


def stop(p, args):
    with p.lock():
        w = p.worker(args.name)
        p.owned_pane(w, live=False)
        with p.db() as db:
            w = p.worker(args.name, db)
            w["alive"] = False
            if w["status"] not in {"done", "merged"}:
                w["status"] = "stopped"
            p.save(db, w)
            p.event(db, w, "stopped", attention=True)
        # Replace the process, retaining the pane and its terminal history.
        p.tmux("respawn-pane", "-k", "-t", w["pane"],
               shlex.join(p.entrypoint() + ["_park", w["name"]]))
    emit({"worker": args.name, "stopped": True, "worktree_preserved": w["worktree"]})


def restart(p, args):
    with p.lock():
        p.scan()
        w = p.worker(args.name)
        if w.get("alive"):
            raise Error("Stop the existing process before restarting.")
        if w["status"] in {"merged", "merging"}:
            raise Error("This assignment has been integrated; launch a new worker.")
        pane = p.panes().get(w.get("pane"))
        if pane and (pane["root"] != str(p.root) or pane["worker"] != w["name"]):
            pane = None
        w.update(run_id=uuid.uuid4().hex, generation=w["generation"] + 1,
                 status="starting", launch_ready=False, alive=False,
                 reported_commit=None, report=None, pane=None, window=None, seen_prompt=False)
        p.write_assignment(w, w["task"])
        with p.db() as db:
            p.save(db, w)
        w = p.start_pane(w, existing=pane)
    emit(w)


def doctor(p):
    result = run([p.config["codex_bin"], "--version"], timeout=10, check=False)
    features = run([p.config["codex_bin"], "features", "list"], timeout=10, check=False)
    emit({"root": str(p.root), "config": p.config,
          "codex_version": result.stdout.strip(),
          "hooks_feature": next((line for line in features.stdout.splitlines()
                                 if line.split()[:1] == ["hooks"]), "not advertised"),
          "tmux": run(["tmux", "-V"]).stdout.strip(),
          "has_commit": git(p.root, "rev-parse", "--verify", "HEAD", check=False).returncode == 0,
          "dirty": git(p.root, "status", "--porcelain").stdout,
          "workers": p.scan()})


def parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", help="Director checkout (inferred from Git by default)")
    commands = parser.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init", help="Configure this project only")
    init.add_argument("--session", default="crafty-builders")
    init.add_argument("--socket", help="Private tmux socket name, useful for experiments")
    init.add_argument("--codex-bin", default="codex", help="Executable path, without shell arguments")
    init.add_argument("--no-hooks", action="store_true", help="Use notify + scanning for older Codex")
    commands.add_parser("doctor", help="Check prerequisites, local configuration, and pane health")
    commands.add_parser("monitor", help="Ensure the project's tmux session and initial watcher exist")
    for name in ("launch", "steer", "assign"):
        cmd = commands.add_parser(name)
        cmd.add_argument("name")
        group = cmd.add_mutually_exclusive_group(required=True)
        group.add_argument("--prompt")
        group.add_argument("--prompt-file")
        if name == "launch":
            cmd.add_argument("--role", required=True)
        if name != "steer":
            cmd.add_argument("--scope", action="append", required=name == "launch",
                             help="Owned directory prefix or glob; repeat for multiple paths")
    for name in ("status", "scan"):
        commands.add_parser(name)
    watch = commands.add_parser("watch", help="Continuously scan tmux and print new events")
    watch.add_argument("--interval", type=float, default=1)
    for name in ("inbox", "wait"):
        cmd = commands.add_parser(name, help="Read durable events" if name == "inbox" else "Block until an event needs director attention")
        cmd.add_argument("--after", type=int)
        cmd.add_argument("--consumer", default="director")
        cmd.add_argument("--all", action="store_true", help="Include informational lifecycle events")
        if name == "wait":
            cmd.add_argument("--timeout", type=float, default=0, help="Seconds; 0 waits indefinitely; timeout exits 124")
            cmd.add_argument("--interval", type=float, default=0.5)
    ack = commands.add_parser("ack", help="Acknowledge handled events through this id")
    ack.add_argument("id", type=int)
    ack.add_argument("--consumer", default="director")
    rep = commands.add_parser("report", help="Worker result or question to the director")
    rep.add_argument("name")
    rep.add_argument("--generation", required=True, type=int)
    rep.add_argument("--status", choices=["progress", "done", "blocked", "error"], required=True)
    rep.add_argument("--summary", required=True)
    rep.add_argument("--tests", default="Not run")
    for name in ("inspect", "diff", "merge", "stop", "restart", "attach", "checkpoint"):
        cmd = commands.add_parser(name)
        cmd.add_argument("name")
        if name == "merge":
            cmd.add_argument("--allow-outside-scope", action="store_true")
        if name == "checkpoint":
            cmd.add_argument("-m", "--message", required=True)
    runner = commands.add_parser("_run", help=argparse.SUPPRESS)
    runner.add_argument("name")
    runner.add_argument("run_id")
    parked = commands.add_parser("_park", help=argparse.SUPPRESS)
    parked.add_argument("name")
    notify = commands.add_parser("_notify", help=argparse.SUPPRESS)
    notify.add_argument("name")
    notify.add_argument("run_id")
    notify.add_argument("payload")
    commands.add_parser("_hook", help=argparse.SUPPRESS)
    return parser


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        p = Project(discover_root(args.root), require=args.command != "init")
        cmd = args.command
        if cmd == "init":
            initialize(p, args)
        elif cmd == "launch":
            launch(p, args)
        elif cmd == "doctor":
            doctor(p)
        elif cmd == "monitor":
            with p.lock():
                emit({"session": p.ensure_session()})
        elif cmd == "_run":
            return supervise(p, args)
        elif cmd == "_park":
            print(f"Worker {args.name} stopped. Worktree and pane retained. Use builders restart {args.name}.")
        elif cmd == "_hook":
            emit(lifecycle(p, json.load(sys.stdin)))
        elif cmd == "_notify":
            lifecycle(p, json.loads(args.payload), args.name, args.run_id)
        elif cmd in {"status", "scan"}:
            emit(p.scan())
        elif cmd == "report":
            report(p, args)
        elif cmd in {"steer", "assign", "merge", "stop", "restart"}:
            {"steer": steer, "assign": assign, "merge": integrate, "stop": stop, "restart": restart}[cmd](p, args)
        elif cmd in {"inbox", "wait"}:
            if getattr(args, "interval", 1) <= 0 or getattr(args, "timeout", 0) < 0:
                raise Error("Intervals must be positive and timeouts nonnegative.")
            deadline = time.monotonic() + args.timeout if cmd == "wait" and args.timeout else None
            while True:
                p.scan()
                events = p.events(args.after, args.consumer, args.all)
                if events or cmd == "inbox":
                    emit({"events": events, "through": events[-1]["id"] if events else args.after,
                          "consumer": args.consumer})
                    break
                if deadline is not None and time.monotonic() >= deadline:
                    emit({"events": [], "timeout": True})
                    return 124
                time.sleep(min(args.interval, max(0, deadline - time.monotonic())) if deadline else args.interval)
        elif cmd == "ack":
            with p.db() as db:
                highest = db.execute("SELECT COALESCE(MAX(id),0) FROM events").fetchone()[0]
                if not 0 <= args.id <= highest:
                    raise Error("Cannot acknowledge a negative or future event id.")
                db.execute("INSERT INTO cursors VALUES (?,?) ON CONFLICT(name) "
                           "DO UPDATE SET event_id=MAX(event_id,excluded.event_id)", (args.consumer, args.id))
            emit({"consumer": args.consumer, "through": args.id})
        elif cmd == "watch":
            if args.interval <= 0:
                raise Error("Interval must be positive.")
            after = 0
            while True:
                p.scan()
                for event in p.events(after, all_events=True):
                    print(json.dumps(event), flush=True)
                    after = event["id"]
                time.sleep(args.interval)
        elif cmd == "inspect":
            w = p.worker(args.name)
            emit(w | snapshot(w))
        elif cmd == "diff":
            w = p.worker(args.name)
            print(git(w["worktree"], "diff", w["base"], "--").stdout, end="")
            print(git(w["worktree"], "status", "--short").stdout, end="")
        elif cmd == "attach":
            w = p.worker(args.name)
            p.owned_pane(w, live=False)
            if os.environ.get("TMUX"):
                p.tmux("switch-client", "-t", w["pane"])
            else:
                p.tmux("select-window", "-t", w["window"])
                command = ["tmux"] + (["-L", p.config["socket"]] if p.config.get("socket") else [])
                return subprocess.call(command + ["attach-session", "-t", p.config["session"]])
        elif cmd == "checkpoint":
            with p.lock():
                w = p.worker(args.name)
                if w["status"] not in {"blocked", "stopped", "error", "idle"}:
                    raise Error("Checkpoint requires a paused worker; inspect its diff first.")
                git(w["worktree"], "add", "--all")
                git(w["worktree"], "commit", "-m", args.message)
                emit(snapshot(w))
        return 0
    except (Error, OSError, ValueError, sqlite3.Error, subprocess.TimeoutExpired) as exc:
        print(f"builders: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
