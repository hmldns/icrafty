# Executed Docker acceptance

The first cylinder/sleeve/closed-end-cap core passed Docker acceptance on
2026-09-08, after [local acceptance](LOCAL-GATE.md) and the independently
performed [cap correction trial](TRIAL-GATE.md). `make -C cad verify-docker`
exited **0: 83/83 passed**, with 25 expected-good and 58 intended-negative cases.
There were no skips, missing prerequisites or unexpected failures in this run.

The retained report root in the cad-service checkout is
[`runs/verification/docker-20260908-153704-15f63c85/`](runs/verification/docker-20260908-153704-15f63c85/):
[summary JSON](runs/verification/docker-20260908-153704-15f63c85/summary.json) and
[self-contained gallery](runs/verification/docker-20260908-153704-15f63c85/index.html).
Run files are intentionally ignored; this document identifies the retained
evidence, while source, fixtures and dependency locks are committed.

## Commands, image and native versions

From `/home/hmldns/devel/sandbox/crafty/.worktrees/cad-service`:

```sh
make -C cad image-docker > cad/runs/docker/build-release.stdout.log 2> cad/runs/docker/build-release.stderr.log
make -C cad verify-docker > cad/runs/docker/verify-release.stdout.log 2> cad/runs/docker/verify-release.stderr.log
```

Both commands exited 0. The Make recipes use
`/home/hmldns/.local/bin/uv`, the CAD-local locked environment and cache.
The build report is
[`runs/docker/build-20260908-153658-399fe6c8/build.json`](runs/docker/build-20260908-153658-399fe6c8/build.json).
It records exact package/build commands, Docker versions and logs. The image is
`crafty-cad:5505b38f7e89d493`, immutable ID
`sha256:96cb14fc511dc47e3dff2568ea510d271f4998bf1d49cd4f5bf0696a7d5a12ae`,
473,933,805 bytes. Building used `docker build --network=none --pull=false`
from `scratch`; execution never pulls or uses a network package installer.

`context/package.json`, `native-files.json` and `image-files.json` retain content
digests and file inventories. The service/fixture digest is
`ebc4b6e07aca0a718f46bf451bb8c50e0db60d0d72db9d8badbaa8eaf20760eb`.
[runtime-lock.json](docker/runtime-lock.json) pins 6,278 native/runtime/render
files with tree digest
`bc9879a5257782acc0175500eb5a96bd1badb483c7c2f76a6e0dedc33b9551ab`.
Normal packaging rejects different dependency bytes; intentional lock updates
require review and re-execution as described in [docker/README.md](docker/README.md).

Actual container native execution uses `/usr/bin/python3` 3.14.7, GCC 16.1.1,
ABI `cpython-314-x86_64-linux-gnu`; FreeCAD 1.1.3 revision 44987, commit
`145529fe741292ff0b3977a01195bf0247425794`, imported from
`/usr/lib/freecad/lib/FreeCAD.so`; OCCT 7.9.3. The clean verifier imports no model
source. The image contains the bridge, without the FreeCADCmd/GUI launcher.
Supervisor/render Python is `/opt/venv/bin/python` 3.13.9 (Clang 20.1.4), with
locked NumPy 2.5.3, Pillow 12.3.0, Rich 15.0.0 and jsonschema 4.26.0;
FreeType 2.14.3 and Liberation Sans 2.1.5. Font SHA-256 is
`baccc64becc3eb7d104b7c84d99f5314a0a1f896e2b3ea6c2f22fc08d2003bee`.
The packager used uv 0.11.16. Docker client/engine were 29.7.2, containerd 2.3.4,
runc 1.5.1, host kernel 7.1.9-arch1-2, Linux/amd64 with cgroup v2.

## Deterministic outcomes and native artifacts

The same fixtures and independent expectations ran in fixed order: contract 29,
geometry 9, views 14, exports 3, reuse 4, failures 18. The fresh local baseline
passed **77/77 in 56.643210 seconds**; the container passed **77/77 in 63.724792
seconds**. The aggregate including comparison and five additional Docker cases
took **84.843235 seconds**. Local and Docker agreed on **308 metric records**
and every requested artifact/panel's availability. Numerical comparison uses
absolute 1e-8 plus relative 1e-9; fixture and STEP acceptance retain their separately
documented method-specific tolerances.

Within the report root, native evidence is under
`deterministic/capture-f61c0ce0/verification/`. Each evaluation retains frozen
requests/source, data-only native geometry, service result, process logs, measured
limits and requested artifacts. Useful paths below that directory are:

- `geometry/cap/evaluation-1/result.json` and `artifacts/grid.png` plus sidecar:
  valid single solid, 40 × 40 × 12 mm, actual bore face 36 mm, roof face distance
  2 mm, cavity depth 10 mm, volume 4900.884539600079 mm³, area
  5152.211951887267 mm², centroid approximately (0, 0, 8.076923076923077) mm.
- `geometry/extra-solid/evaluation-1/`: intended aggregate failures and visible
  detached extra solid; wrong-bore and missing-roof have their own preserved cases.
- `views/failed-view/evaluation-1/artifacts/grid.png`: failed bottom-view slot
  remains visible with a diagnostic, while isometric and side panels remain ready.
  Separate composition/sidecar failures retain their independent images.
- `exports/requested-only-and-clean-reopen/step/artifacts/cap.step` and
  `control/cap/comparison.json`: clean reopen passed mm units, validity, count,
  bounds and volume. STEP is 5,177 bytes, SHA-256
  `37e239bc73f1b2426b22b75b1db5c4e50df75d0760af559308575b723a28d2dc`.

The service builder opened the final cap and failed-panel grids and inspected
their actual camera titles, viewport placement, geometry, callouts and visible
failure. The extra-solid grid was also visually inspected in the preceding
83/83 run `docker-20260908-153137-e0331f9c`; both reports are retained.
The earliest successful isolated cylinder build/clean BRep verification/PNG is
retained at `runs/docker/native-second/job/capture-cbf2ca8d/result/result.json`:
valid single solid, diameter 20 mm, volume 6283.185307179591 mm³.

## Kernel isolation and actual resource pressure

`deterministic/docker.json` retains the full create command, inspect settings,
service exit, archive capture and removal proof. The initial and final container
environment records prove read-only image/input mounts, private bounded output,
only loopback networking, no provider credentials/database configuration or
Docker socket, no-new-privileges and active seccomp. Default limits are 2 GiB
memory with no swap, 2 CPUs, 64 tasks, 512 MiB output tmpfs, 128 MiB temporary
tmpfs, 16 MiB shared memory, 128 MiB per file, 256 open files, 300 s outer time,
and 2 MiB host logs. The full deterministic container's measured memory peak was
**145,035,264 bytes**. Inner native/raster limits remain 1 GiB, 32 processes,
30 s per call, 300 cumulative CPU seconds, 128 MiB output and 256 KiB logs.

`actual-memory-cpu-process-output-time-and-cancellation/` retains independent
pressure probes and actual kernel results:

- 64 MiB memory limit: `OOMKilled: true`, exit 137, no fabricated ready capture.
- 0.5 CPU quota: 20 throttled periods, 5,477,984 throttled microseconds.
- 16-task limit: real fork refusal and `pids.events` reports `max 1`.
- 2 MiB output tmpfs: real ENOSPC with bounded partial files retained.
- 1 s wall deadline: stopped detached descendants and removed the container
  in 1.362115 s; cancellation retained completed diagnostics and exit 130,
  completing cleanup in 1.411543 s. Every probe container was removed.

`generated-source-cannot-author-supervisor-evidence/proof.json` records native
syscalls made by the model process, bypassing Python audit hooks: UID/GID 65532,
no effective capabilities; input write EROFS (30), service/result write EACCES
(13), supervisor signal EPERM (1), external network connect ENETUNREACH (101).
The same model returned an actual cylinder that passed clean measurement and
rendering. Supervisor and verifier retain their own UID and authoritative files.
The public CLI case separately verifies exact 0/1/2 semantics, sole result-path
stdout, frozen source filenames, bad paths/bundles/GLB/handles, invalid source,
atomic result publication and unchanged existing output directories.

## Reuse, cancellation and cross-container restore

`retained-operations-and-cross-container-snapshot-restore/retained-evidence.json`
records one instrumented source execution, one build, one native load and five
queries: image, metrics, changed camera/criterion, STEP and a cancelled render.
Geometry remained usable after query cancellation. Before/after BRep bytes,
placement, feature membership and measured baseline were unchanged. The actual
placed cylinder has diameter 20 mm, face distance 20 mm and volume
6283.185307179597 mm³; its deliberately foreign face stays unavailable.

Measured host timings were: cold ensure **1.017648 s**, warm image **0.514538 s**,
metrics **0.004859 s**, changed camera/criterion **0.412876 s**, STEP **0.303310 s**.
Cold ensure includes container startup and durable snapshot capture. The native
build itself took 0.283542 s. A forced loss of that container made its old handle
explicitly unavailable while preserving the captured snapshot path.

`restore-evidence.json` records restoration into a new container with a new handle,
the same geometry digest, **zero builds/source executions, one restore and one
load**. Restore including startup/capture took **0.843489 s**; native restore took
0.005579 s. An actual subsequent measured query is retained at
`restored/capture-ceed643a/restored-query/result.json`. Explicit release then made
the restored handle unavailable. The snapshot descriptor points to the durable
host bundle; no source fallback occurs.

## Resolved setup issues and limits of this gate

Early retained failures exposed a lazy FreeCAD `PartEnums.py` dependency and an
incomplete ELF dependency scan that omitted libffi. Packaging now explicitly
includes the helper, scans only executable/shared ELF objects and rejects every
failed dependency inspection. The daemon's `docker cp` returned an empty archive
for private tmpfs; a bounded service-owned archive reader now captures it while
PID 1 keeps it alive. Original failed reports remain under `runs/docker/` and
`runs/verification/`; none counts toward acceptance.

The accepted boundary is the executed Linux/amd64 Docker configuration, using a
trusted host Docker daemon. It is distinct from the known-input local process
stage. Kernel OOM/forced kill can destroy unfinished tmpfs work; only completed
host captures survive. Successful ensure captures its snapshot before returning.
Host capture rejects links/special files and bounds bytes, file count and time.
Different native/package bytes require a reviewed lock update and new evidence.
No native setup issue remains for this pinned core. Bolt/nut bodies, threads,
custom nuts and complex fixtures remain later CAD-RUN-16 stages; agent transport,
physical fit, manufacturing and printing are outside this first-core acceptance.
