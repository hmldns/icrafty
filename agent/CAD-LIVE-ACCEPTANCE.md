# Local CAD chat acceptance

Generation 2 backend milestone: **45 tests passed in 48.00 seconds**, exit 0,
with no skips. Retained report `agent/runs/cad-backend-accepted.xml`, plus
`agent/runs/cad-backend-accepted/summary.json` and `gallery.html`. The exact command
was the backend acceptance command in CAD-INTEGRATION.md with
`--basetemp runs/cad-backend-accepted --junitxml runs/cad-backend-accepted.xml`.
The runtime was Python 3.13.9, MCP 1.30.0 and pinned Codex ACP adapter 1.10.0.
Native FreeCAD 1.1.3 revision 44987 used `/usr/bin/python3` 3.14.7,
`cpython-314-x86_64-linux-gnu`, OCCT 7.9.3, Pillow 12.3.0, NumPy 2.5.3 and
FreeType 2.14.3. Existing native versions/limits are recorded in every result.

Real native cylinder and cap evidence passed. The cap measured 40×40×12 mm,
bore 36 mm, roof face separation 2 mm, cavity 10 mm and volume
4900.884539600079 mm³. The builder inspected the cylinder PNG and the cap's
isometric/bottom/front grid; camera titles and inline bore/roof/cavity labels
were readable. An actual stdio MCP test ensured once and queried its handle:
source/build/load/query counts 1/1/1/1. A separate restore test used zero source
executions and one native load/restore, preserving geometry identity. All 18
layout × annotation × delivery combinations passed with actual native images.
Tests also preserved available evidence when another output was unavailable.

**The full live chat gate has not yet run.** A real MCP/native transport test and explicit fake ACP lifecycle tests
do not establish a live Codex modeling session or mounted browser acceptance.

The dedicated runtime uses port 8807 and private data in this worker checkout's
`.builders/cad-chat-state`; it never uses the main backend's saved chats. Setup,
the accepted protocol, schemas and sample prompts are in
[CAD-INTEGRATION.md](CAD-INTEGRATION.md).

Before final completion this record must identify actual conversational and CAD
ACP sessions/operations, the renderer review URL, inspected PNGs, native metrics,
requested-only STEP download/digest, zero-build evidence reuse, a separate revised
model, cancellation/failure and same-session restore, including source/build/load/
restore/query counts and retained native logs. Local workspace/process separation
is the current execution profile. Product Docker orchestration is not claimed.
