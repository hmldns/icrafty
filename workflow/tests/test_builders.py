"""Real Git + real tmux integration tests with a deterministic Codex fixture."""

from concurrent.futures import ThreadPoolExecutor
from argparse import Namespace
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import uuid

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
SCRIPT = WORKFLOW_DIR / "tools" / "builders.py"
FAKE = WORKFLOW_DIR / "tests" / "fake_codex.py"
spec = importlib.util.spec_from_file_location("builders", SCRIPT)
builders = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builders)


@unittest.skipUnless(all(shutil.which(s) for s in ("tmux", "git", "uv")), "Git, tmux and uv required")
class BuildersTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="builders test '")
        self.root = Path(self.temp.name)
        self.socket = "builders-test-" + uuid.uuid4().hex[:16]
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Builder Test")
        self.git("config", "user.email", "builder@example.invalid")
        (self.root / "AGENTS.md").write_text("Shared project instructions.\n")
        (self.root / "shared.txt").write_text("base\n")
        self.git("add", "AGENTS.md", "shared.txt")
        self.git("commit", "-m", "Baseline")
        self.cli("init", "--socket", self.socket, "--codex-bin", str(FAKE))
        self.p = builders.Project(self.root)

    def tearDown(self):
        subprocess.run(["tmux", "-L", self.socket, "kill-server"], capture_output=True)
        self.temp.cleanup()

    def git(self, *args, root=None, check=True):
        result = subprocess.run(["git", "-C", str(root or self.root), *map(str, args)],
                                capture_output=True, text=True, timeout=15)
        if check:
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return result.stdout.strip()

    def cli(self, *args, code=0):
        result = subprocess.run([sys.executable, str(SCRIPT), "--root", str(self.root), *map(str, args)],
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, code, result.stdout + result.stderr)
        if code == 0:
            return json.loads(result.stdout)
        return result

    def until(self, predicate, timeout=8):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = predicate()
            if value:
                return value
            time.sleep(0.05)
        self.fail("Condition did not become true before timeout")

    def launch(self, name="alpha", scope="result.txt", mode="idle"):
        w = self.cli("launch", name, "--role", "Narrow test worker", "--scope", scope,
                     "--prompt", "TEST_MODE=" + mode)
        if mode == "crash":
            self.until(lambda: self.p.worker(name).get("alive") is False)
        else:
            self.until(lambda: "FAKE_CODEX_READY" in self.p.tmux(
                "capture-pane", "-p", "-t", w["pane"]).stdout)
        return self.p.worker(name)

    def commit(self, w, path="result.txt", content="result\n"):
        target = Path(w["worktree"]) / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        self.git("add", path, root=w["worktree"])
        self.git("commit", "-m", "Worker change", root=w["worktree"])

    def report(self, w, status="done", code=0):
        return self.cli("report", w["name"], "--generation", w["generation"], "--status", status,
                        "--summary", "Useful result", "--tests", "Validated fixture", code=code)

    def assert_live_shell(self, w):
        self.until(lambda: (pane := self.p.panes().get(w["pane"]))
                   and pane["dead"] == "0" and pane["mode"] == "shell")
        self.p.tmux("send-keys", "-t", w["pane"], "-l", "pwd > shell-cwd.txt")
        self.p.tmux("send-keys", "-t", w["pane"], "Enter")
        result = Path(w["worktree"]) / "shell-cwd.txt"
        self.until(lambda: result.exists() and result.read_text().strip() == w["worktree"])
        self.assertEqual(self.p.panes()[w["pane"]]["window"], w["window"])
        self.assertFalse(self.p.worker(w["name"])["alive"])

    def test_launch_shared_instructions_and_local_configuration(self):
        w = self.launch()
        self.assertEqual(w["status"], "idle")
        self.assertTrue(w["hooks_seen"])
        self.assertEqual(w["thread_id"], "fake-alpha")
        link = Path(w["worktree"]) / "AGENTS.override.md"
        self.assertTrue(link.is_symlink())
        self.assertEqual(link.resolve(), self.root / "AGENTS.md")
        self.assertEqual(self.git("status", "--porcelain", root=w["worktree"]), "")
        self.assertFalse((Path(w["worktree"]) / ".codex").exists())
        args = json.loads((self.p.state / "workers/alpha/fake-argv.json").read_text())
        self.assertIn("workspace-write", args)
        self.assertFalse(any("dangerously" in a for a in args))
        self.assertIn("assignment generation: 1", args[-1])
        self.assertIn(str(self.root / "AGENTS.md"), args[-1])
        self.assertIn(str(WORKFLOW_DIR / "ROLES.md"), args[-1])
        self.assertIn("follow the Worker section", args[-1])
        self.assertEqual(sum(a.startswith("hooks.") for a in args), len(builders.HOOKS))

    def test_notify_fallback_and_deduplication(self):
        w = self.launch()
        events = self.p.events(all_events=True)
        self.assertEqual(len([e for e in events if e["kind"] == "Stop"]), 1)
        other = self.launch("other", mode="nohooks")
        self.assertEqual(other["status"], "running")
        self.assertIsNone(other["thread_id"])
        self.assertNotIn("hooks_seen", other)
        event = self.p.events()[-1]
        self.assertEqual(event["kind"], "notification")
        self.assertFalse(event["payload"]["verified"])
        self.assertNotIn("resume", self.p.command(other))
        self.assertEqual(w["status"], "idle")

    def test_child_notify_before_hooks_cannot_claim_worker_identity(self):
        w = self.launch(mode="nohooks")
        child = {"type": "agent-turn-complete", "cwd": w["worktree"],
                 "thread-id": "title-session", "turn-id": "title-turn",
                 "last-assistant-message": '{"title":"Read camera annotation instructions"}'}
        builders.lifecycle(self.p, child, w["name"], w["run_id"])
        current = self.p.worker(w["name"])
        self.assertIsNone(current["thread_id"])
        self.assertEqual(current["status"], "running")
        self.assertNotIn("last_turn", current)
        events = self.p.events(all_events=True)
        self.assertEqual(events[-1]["kind"], "notification")
        self.assertEqual(events[-1]["payload"]["source"], "notify")
        self.assertFalse(events[-1]["payload"]["verified"])
        builders.lifecycle(self.p, child, w["name"], w["run_id"])
        self.assertEqual(self.p.events(all_events=True), events)

        root = {"cwd": w["worktree"], "session_id": "fake-alpha", "turn_id": "0"}
        with patch.dict("os.environ", {"BUILDERS_RUN_ID": w["run_id"]}):
            builders.lifecycle(self.p, dict(root, hook_event_name="SessionStart", source="startup"))
            builders.lifecycle(self.p, dict(root, hook_event_name="Stop", last_assistant_message="Root stopped"))
        current = self.p.worker(w["name"])
        self.assertEqual(current["thread_id"], "fake-alpha")
        self.assertEqual(current["thread_id_source"], "hook")
        self.assertEqual(current["status"], "idle")
        # The earlier unverified notify for this root turn must not suppress Stop.
        self.assertEqual(current["last_turn"]["summary"], "Root stopped")
        self.assertEqual(sum(e["kind"] == "Stop" for e in self.p.events()), 1)

        events = self.p.events(all_events=True)
        builders.lifecycle(self.p, child, w["name"], w["run_id"])
        builders.lifecycle(self.p, dict(child, **{"thread-id": "fake-alpha", "turn-id": "0"}),
                           w["name"], w["run_id"])
        with patch.dict("os.environ", {"BUILDERS_RUN_ID": w["run_id"]}):
            builders.lifecycle(self.p, dict(root, hook_event_name="Stop", agent_id="nested-child"))
            builders.lifecycle(self.p, dict(root, hook_event_name="SessionStart", session_id="other-root"))
        self.assertEqual(self.p.events(all_events=True), events)

    def test_root_prompt_repairs_legacy_notify_identity_after_hook_trust(self):
        w = self.launch(mode="nohooks")
        with self.p.db() as db:
            # State left by the original implementation before hooks were trusted.
            w.update(thread_id="title-session", status="idle",
                     last_turn={"thread_id": "title-session", "summary": "Generated title"})
            self.p.save(db, w)
        self.assertNotIn("resume", self.p.command(w))
        with patch.dict("os.environ", {"BUILDERS_RUN_ID": w["run_id"]}):
            builders.lifecycle(self.p, {"hook_event_name": "UserPromptSubmit", "cwd": w["worktree"],
                                       "session_id": "real-parent", "turn_id": "direction",
                                       "prompt": "Continue the assigned task"})
        current = self.p.worker(w["name"])
        self.assertEqual(current["thread_id"], "real-parent")
        self.assertEqual(current["thread_id_source"], "hook")
        self.assertTrue(current["hooks_seen"])
        self.assertEqual(current["status"], "running")
        self.assertNotIn("last_turn", current)
        command = self.p.command(current)
        self.assertEqual(command[command.index("resume") + 1], "real-parent")

    def test_unverified_notify_still_wakes_with_hooks_disabled(self):
        self.p.config["hooks"] = False
        self.p.config_path.write_text(json.dumps(self.p.config))
        w = self.launch()
        events = self.cli("wait", "--timeout", "1")["events"]
        self.assertEqual([e["kind"] for e in events], ["notification"])
        self.assertFalse(events[0]["payload"]["verified"])
        self.assertIsNone(w["thread_id"])
        self.assertEqual(w["status"], "running")

    def test_invalid_or_child_callbacks_cannot_register_identity(self):
        w = self.launch(mode="nohooks")
        events = self.p.events(all_events=True)
        root = {"hook_event_name": "UserPromptSubmit", "cwd": w["worktree"],
                "session_id": "real-parent", "turn_id": "direction"}
        with patch.dict("os.environ", {"BUILDERS_RUN_ID": w["run_id"]}):
            for extra in ({"agent_id": "child"}, {"hook_event_name": "SubagentStart"},
                          {"session_id": None}, {"cwd": str(self.root)}):
                builders.lifecycle(self.p, dict(root, **extra))
        with patch.dict("os.environ", {"BUILDERS_RUN_ID": "stale-run"}):
            builders.lifecycle(self.p, root)
        for extra in ({"cwd": str(self.root)}, {"type": "SessionStart"}, {"thread-id": None}):
            builders.lifecycle(self.p, {"type": "agent-turn-complete", "thread-id": "child",
                                       "cwd": w["worktree"], **extra}, w["name"], w["run_id"])
        self.assertEqual(self.p.events(all_events=True), events)
        self.assertIsNone(self.p.worker(w["name"])["thread_id"])

    def test_wait_wakes_after_report_and_requires_ack(self):
        w = self.launch(mode="busy")
        self.assertEqual(self.cli("inbox")["events"], [])
        process = subprocess.Popen([sys.executable, str(SCRIPT), "--root", str(self.root),
                                    "wait", "--timeout", "5", "--interval", "0.05"],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            time.sleep(0.15)
            self.assertIsNone(process.poll())
            self.report(w, "blocked")
            stdout, stderr = process.communicate(timeout=6)
            self.assertEqual(process.returncode, 0, stderr)
            batch = json.loads(stdout)
            self.assertEqual(batch["events"][0]["kind"], "blocked")
            self.assertEqual(self.cli("wait", "--timeout", "0.1")["events"], batch["events"])
            self.cli("ack", batch["through"])
            self.cli("wait", "--timeout", "0.1", "--interval", "0.05", code=124)
            self.assertTrue(self.cli("inbox", "--after", "0", "--all")["events"])
        finally:
            if process.poll() is None:
                process.kill()
            process.communicate()

    def test_crash_and_missing_pane_are_reported_once(self):
        crashed = self.launch(mode="crash")
        self.assertEqual(crashed["status"], "error")
        self.assertEqual(crashed["exit_code"], 23)
        self.assert_live_shell(crashed)
        w = self.launch("vanished", mode="busy")
        self.p.tmux("kill-pane", "-t", w["pane"])
        self.cli("scan")
        self.cli("scan")
        events = self.p.events(all_events=True)
        self.assertEqual(sum(e["kind"] == "exited" and e["worker"] == "vanished" for e in events), 1)
        self.assertEqual(self.p.worker("vanished")["status"], "error")

    def test_scan_handles_a_missing_server(self):
        w = self.launch(mode="busy")
        self.p.tmux("kill-server")
        self.cli("scan")
        self.assertFalse(self.p.worker(w["name"])["alive"])

    def test_steering_is_literal_and_invalidates_completion(self):
        w = self.launch()
        self.report(w)
        direction = "Keep `literal` and $(touch PWNED) intact.\nQuoted 'text'; ${HOME}"
        self.cli("steer", w["name"], "--prompt", direction)
        file = self.p.state / "workers" / w["name"] / "fake-input.txt"
        self.until(lambda: file.exists() and direction in file.read_text())
        self.until(lambda: self.p.worker(w["name"])["status"] == "idle")
        self.assertIsNone(self.p.worker(w["name"])["reported_commit"])
        self.assertFalse((Path(w["worktree"]) / "PWNED").exists())
        self.cli("steer", w["name"], "--prompt", "bad\x1btext", code=1)

    def test_dirty_and_stale_reports_cannot_merge(self):
        w = self.launch()
        (Path(w["worktree"]) / "result.txt").write_text("unfinished")
        self.report(w, code=1)
        self.commit(w)
        self.report(w)
        self.commit(w, content="new result")
        self.cli("merge", w["name"], code=1)
        self.assertFalse((self.root / "result.txt").exists())
        self.report(w)
        (self.root / "local.txt").write_text("Director work")
        self.cli("merge", w["name"], code=1)
        (self.root / "local.txt").unlink()
        self.cli("merge", w["name"])
        self.assertEqual((self.root / "result.txt").read_text(), "new result")

    def test_scope_guards_and_successful_merge(self):
        w = self.launch()
        self.commit(w, path="outside.txt")
        self.report(w)
        self.cli("merge", w["name"], code=1)
        merged = self.cli("merge", w["name"], "--allow-outside-scope")
        self.assertEqual(merged["status"], "merged")
        self.assertTrue((self.root / "outside.txt").exists())
        self.assertEqual(len(self.git("rev-list", "--parents", "-n", "1", "HEAD").split()), 3)

    def test_recording_manual_merge_preserves_local_work(self):
        w = self.launch()
        self.commit(w)
        report = self.report(w)
        (self.root / "shared.txt").write_text("Concurrent director edits\n")
        (self.root / "notes.txt").write_text("Untracked notes\n")
        self.cli("merge", w["name"], code=1)
        self.git("merge", "--no-ff", "--no-edit", report["commit"])
        head = self.git("rev-parse", "HEAD")
        diff = self.git("diff")
        status = self.git("status", "--porcelain")
        merged = self.cli("merge", w["name"])
        self.assertEqual(merged["status"], "merged")
        self.assertEqual(merged["integrated_commit"], report["commit"])
        self.assertEqual(merged["integration_head"], head)
        self.assertEqual(self.git("rev-parse", "HEAD"), head)
        self.assertEqual(self.git("diff"), diff)
        self.assertEqual(self.git("status", "--porcelain"), status)
        self.assertEqual(self.git("diff", "--cached"), "")
        self.assertEqual((self.root / "notes.txt").read_text(), "Untracked notes\n")

    def test_reuse_preserves_window_and_rejects_old_generation(self):
        w = self.launch()
        self.commit(w)
        self.report(w)
        self.cli("merge", w["name"])
        current = self.cli("assign", w["name"], "--prompt", "Second narrow assignment", "--scope", "next.txt")
        self.assertEqual(current["pane"], w["pane"])
        self.assertEqual(current["thread_id"], w["thread_id"])
        self.assertEqual(current["generation"], 2)
        self.assertEqual(current["base"], self.git("rev-parse", "HEAD"))
        self.report(w, code=1)
        self.until(lambda: self.p.worker(w["name"])["status"] == "idle")
        self.commit(current, "next.txt")
        result = self.report(current)
        self.assertEqual(result["files"], ["next.txt"])
        self.cli("merge", w["name"])

    def test_restart_preserves_work_and_ignores_stale_callbacks(self):
        w = self.launch()
        (Path(w["worktree"]) / "result.txt").write_text("In progress")
        self.cli("stop", w["name"])
        restarted = self.cli("restart", w["name"])
        self.until(lambda: self.p.worker(w["name"])["status"] == "idle")
        self.assertNotEqual(restarted["run_id"], w["run_id"])
        self.assertEqual(restarted["pane"], w["pane"])
        self.assertTrue((Path(w["worktree"]) / "result.txt").exists())
        before = self.p.events(all_events=True)
        builders.lifecycle(self.p, {"type": "agent-turn-complete", "turn-id": "late",
                                   "thread-id": w["thread_id"]}, w["name"], w["run_id"])
        self.assertEqual(self.p.events(all_events=True), before)

    def test_conflicts_are_left_for_director_and_recoverable(self):
        w = self.launch(scope="shared.txt")
        self.commit(w, "shared.txt", "worker\n")
        self.report(w)
        (self.root / "shared.txt").write_text("director\n")
        self.git("add", "shared.txt")
        self.git("commit", "-m", "Director change")
        self.cli("merge", w["name"], code=1)
        self.assertIn("UU shared.txt", self.git("status", "--short"))
        self.assertEqual(self.p.worker(w["name"])["status"], "done")
        (self.root / "shared.txt").write_text("combined\n")
        self.git("add", "shared.txt")
        self.git("commit", "-m", "Resolve worker integration")
        self.cli("merge", w["name"])
        self.assertEqual(self.p.worker(w["name"])["status"], "merged")

    def test_permission_hook_only_reports_never_approves(self):
        w = self.launch()
        output = builders.lifecycle(self.p, {"hook_event_name": "PermissionRequest",
                                    "cwd": w["worktree"], "session_id": w["thread_id"],
                                    "tool_name": "Bash", "tool_input": {"command": "do something"}})
        self.assertEqual(output, {})
        self.assertEqual(self.p.worker(w["name"])["status"], "needs_approval")
        self.assertEqual(self.p.events()[-1]["kind"], "PermissionRequest")

    def test_startup_prompt_wakes_before_hooks_are_available(self):
        w = self.launch(mode="trust")
        events = self.cli("wait", "--timeout", "1")["events"]
        self.assertEqual(events[-1]["kind"], "needs_input")
        self.assertEqual(self.p.worker(w["name"])["status"], "needs_input")
        self.cli("scan")
        self.assertEqual(sum(e["kind"] == "needs_input" for e in self.p.events()), 1)

    def test_concurrent_reports_have_unique_durable_ids(self):
        w = self.launch(mode="busy")
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.report(w, "progress"), range(12)))
        ids = {r["event_id"] for r in results}
        self.assertEqual(len(ids), 12)
        self.assertEqual(ids, {r["id"] for r in self.p.events()})
        self.cli("ack", max(ids) + 100, code=1)

    def test_stop_keeps_usable_shell_and_does_not_steer_it(self):
        w = self.launch()
        unrelated = self.p.tmux("new-window", "-d", "-P", "-F", "#{pane_id}",
                                 "-t", "crafty-builders:", "-n", "unmanaged").stdout.strip()
        self.cli("stop", w["name"])
        self.assertIn(unrelated, self.p.panes())
        self.assert_live_shell(w)
        self.assertEqual(self.p.tmux("show-option", "-w", "-v", "-t", w["window"],
                                    "remain-on-exit").stdout.strip(), "on")
        self.cli("steer", w["name"], "--prompt", "Hello", code=1)

    def test_normal_exit_keeps_same_live_shell_and_reports_once(self):
        w = self.launch()
        self.p.tmux("send-keys", "-t", w["pane"], "/exit", "Enter")
        self.assert_live_shell(w)
        self.assertEqual(self.p.worker(w["name"])["exit_code"], 0)
        self.cli("scan")
        self.cli("scan")
        self.assertEqual(sum(e["kind"] == "exited" for e in self.p.events()), 1)
        self.cli("steer", w["name"], "--prompt", "touch forbidden.txt", code=1)
        self.assertFalse((Path(w["worktree"]) / "forbidden.txt").exists())

    def test_upgrade_installs_hook_without_interrupting_live_worker(self):
        w = self.launch()
        pid = self.p.tmux("display-message", "-p", "-t", w["pane"], "#{pane_pid}").stdout
        self.p.tmux("set-hook", "-wu", "-t", w["window"], builders.SHELL_EXIT_HOOK)
        # An unrelated hook and an unrelated split pane must survive this upgrade.
        self.p.tmux("set-hook", "-w", "-t", w["window"], "pane-died[3]", "display-message unrelated")
        self.cli("keep-shells")
        self.cli("keep-shells")
        self.assertEqual(self.p.tmux("display-message", "-p", "-t", w["pane"], "#{pane_pid}").stdout, pid)
        self.assertTrue(self.p.worker(w["name"])["alive"])
        self.assertIn("unrelated", self.p.tmux("show-hooks", "-w", "-t", w["window"]).stdout)
        other = self.p.tmux("split-window", "-d", "-P", "-F", "#{pane_id}", "-t", w["pane"], "exit 7").stdout.strip()
        self.until(lambda: self.p.panes()[other]["dead"] == "1")
        self.pane_exit(w, pane=other)
        self.assertEqual(self.p.panes()[other]["dead"], "1")
        self.assertTrue(self.p.worker(w["name"])["alive"])
        self.p.tmux("send-keys", "-t", w["pane"], "/exit", "Enter")
        self.assert_live_shell(w)

    def pane_exit(self, w, pane=None):
        builders.pane_exited(self.p, Namespace(name=w["name"], run_id=w["run_id"], pane=pane or w["pane"]))

    def test_upgrade_recovers_an_old_dead_pane(self):
        w = self.launch()
        self.p.tmux("set-hook", "-wu", "-t", w["window"], builders.SHELL_EXIT_HOOK)
        self.p.tmux("respawn-pane", "-k", "-t", w["pane"], "exit 9")
        self.until(lambda: self.p.panes()[w["pane"]]["dead"] == "1")
        self.cli("keep-shells")
        self.assert_live_shell(w)
        self.assertEqual(self.p.worker(w["name"])["exit_code"], 9)

    def test_stale_exit_callback_cannot_replace_restarted_worker(self):
        w = self.launch()
        self.cli("stop", w["name"])
        self.assert_live_shell(w)
        restarted = self.cli("restart", w["name"])
        self.until(lambda: self.p.worker(w["name"])["status"] == "idle")
        pid = self.p.tmux("display-message", "-p", "-t", w["pane"], "#{pane_pid}").stdout
        self.pane_exit(w)
        self.assertEqual(self.p.tmux("display-message", "-p", "-t", w["pane"], "#{pane_pid}").stdout, pid)
        self.assertEqual(self.p.panes()[w["pane"]]["mode"], "worker")
        self.assertTrue(self.p.worker(restarted["name"])["alive"])

    def test_automatic_result_wakes_and_is_integratable(self):
        w = self.launch(mode="auto")
        self.assertEqual(w["status"], "done")
        events = self.cli("wait", "--timeout", "0.1")["events"]
        self.assertEqual([e["kind"] for e in events], ["done"])
        self.cli("merge", w["name"])

    def test_checkpoint_recovers_a_blocked_worker(self):
        w = self.launch()
        (Path(w["worktree"]) / "result.txt").write_text("reviewed result\n")
        self.report(w, "blocked")
        result = self.cli("checkpoint", w["name"], "-m", "Reviewed worker result")
        self.assertEqual(result["dirty"], "")
        self.assertEqual(result["files"], ["result.txt"])
        self.report(w)
        self.cli("merge", w["name"])

    def test_monitor_recovers_without_duplicate_windows(self):
        self.cli("monitor")
        self.cli("monitor")
        self.assertEqual(len(self.p.panes()), 1)
        pane = next(iter(self.p.panes()))
        self.p.tmux("kill-pane", "-t", pane)
        self.cli("monitor")
        self.assertEqual(len(self.p.panes()), 1)


if __name__ == "__main__":
    unittest.main()
