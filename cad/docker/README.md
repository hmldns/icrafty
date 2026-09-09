# Isolated CAD runtime

The Docker package runs the same file contract, native verifier, software renderer
and deterministic fixtures as the local service. The separate correction trial
passed first; its evidence is in [TRIAL-GATE.md](../TRIAL-GATE.md). Docker execution
and acceptance reports belong under ignored `cad/runs/`, with the final measured
gate recorded in [DOCKER-GATE.md](../DOCKER-GATE.md).

## Build and run

From the repository root, using the accepted Linux/amd64 native setup in
[the CAD README](../README.md):

```sh
uv sync --directory cad --cache-dir .uv-cache --locked
make -C cad native-setup
make -C cad image-docker
make -C cad verify-docker
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad.docker evaluate \
  --request examples/cylinder/request.json --output runs/docker-cylinder-001
```

The public Docker evaluator prints only the finalized host `result.json` path on
stdout; diagnostics go to stderr. Exit 0 means completed orchestration even when
criteria fail, 1 means failed/cancelled execution, and 2 means rejected input or
setup/output reservation failure. Files are copied and validated before the host
supervisor atomically publishes the final manifest. An existing output directory
is never reused. Only declared frozen input files are mounted. Unsupported kinds,
invalid paths, invalid bundles, nonfinite values and unknown fields are rejected.
A live handle supplied to a new one-shot runtime reports `geometry_unavailable`;
use its explicit native snapshot for reuse across CLI calls.

`image-docker` writes a fresh build directory containing package/native-file/image
manifests, complete build commands/logs, Docker versions and immutable image ID.
`runs/docker/current-image.json` points to that successful build. `verify-docker`
checks the current source/fixture digest against it; changed service/fixture bytes
require rebuilding. `CRAFTY_DOCKER_IMAGE` may explicitly select an already built
image for diagnosis or deployment; the launcher resolves it to an immutable local
image ID and never pulls during execution.

The harness also accepts its normal selections and JSON-only stdout:

```sh
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad.harness run \
  --suite geometry --runtime docker --output runs/docker-geometry-001 --json
```

The full gate executes the same six suites in their declared order, compares a
fresh local run's measurements and artifact/panel availability, and runs additional
real Docker isolation, resource, public-CLI and retained-state cases. Direct harness
exits remain 0/1/2/130; Make itself conventionally reports a failing recipe as 2.
Missing Docker, an absent/stale image or an empty selection cannot pass.

## Pinned dependencies and build scope

[runtime-lock.json](runtime-lock.json) pins installed native package versions and
a digest of every selected native/runtime/render/font file. It also pins the uv
lock digest and supervisor Python version. [package.py](package.py) copies the
explicit dependency closure into a fresh image context. This includes the native
CPython 3.14.7/FreeCAD 1.1.3/OCCT 7.9.3 libraries, the accepted CPython 3.13.9 uv
runtime with locked NumPy/Pillow/Rich/jsonschema packages, Liberation Sans, and
licenses. FreeCAD's lazily imported `PartEnums.py` is included explicitly.
The subsequent import fix also includes `MeshPart.so`, `Mesh.so` and their ELF
closure, plus the precompiled service-owned adaptive properties bridge. Its
source/ABI/binary digests are separately pinned in the runtime lock. SWIG and the
compiler are build-time dependencies and are not installed in the image.
Relocatable build objects are excluded; any failed ELF dependency inspection is
an error, so an incomplete dependency closure cannot be accepted.

The Dockerfile starts from `scratch`. Building uses `--network=none --pull=false`
and needs no package registry, credentials, system configuration, display server
or GPU. The image contains the native Python bridge, not the FreeCAD GUI or
FreeCADCmd launcher. Every native execution reports its real imported FreeCAD,
OCCT, Python/ABI and render/font versions. `image-files.json` identifies all image
bytes; `native-files.json` explains the pinned native tree digest.

Reproduction requires the exact accepted Arch native packages and uv Python
distribution, or the retained built image/context. A different host dependency
tree fails the byte lock. A maintainer can deliberately review a new native setup
with `uv run --directory cad --cache-dir .uv-cache --locked python docker/package.py
--output runs/docker/reviewed-update --refresh-lock`, then rebuild and rerun all
gates. This flag is a lock update, never a fallback used by normal builds.
The current executed update is recorded in [NATIVE-IMPORT-FIX.md](../NATIVE-IMPORT-FIX.md);
the original [DOCKER-GATE.md](../DOCKER-GATE.md) remains historical evidence.

## Isolation and bounded evidence retention

The host owns Docker lifecycle and records the full create command and inspect
results. No Docker socket or daemon credentials enter the container. The root
filesystem and private input bind are read-only. `/output` is a private 512 MiB
tmpfs and `/tmp` is a separate 128 MiB tmpfs; both are `noexec,nosuid,nodev`.
The private IPC namespace has a separate 16 MiB `/dev/shm` limit.
No host output directory is writable from the container. The default container
has 2 GiB memory, no swap, a 2-CPU quota, 64 processes/tasks, 128 MiB per-file
limit, 256 open files, and a 300-second outer deadline. The existing native/query
limits apply inside it: 1 GiB memory, 32 owned processes, 30 seconds per query,
128 MiB aggregate query output, and bounded logs/cache lifetime.

The supervisor and clean verifier use UID 0. Generated source uses UID/GID 65532,
no supplementary groups, zero effective capabilities and no-new-privileges.
Its writable model files are confined to its disposable build workspace and
bounded temporary/shared-memory filesystems. The supervisor retains only SETUID, SETGID, CHOWN
and KILL capabilities to manage that distinct identity; all other capabilities
are dropped. Docker's default seccomp policy remains enabled. Model native calls
cannot write the service image, input mount or supervisor-owned result files, or
signal the supervisor. The acceptance probe bypasses Python audit hooks with
native syscalls to test these kernel boundaries.

Networking uses `none`, with only loopback. The image receives no provider keys,
database configuration, user home, project environment or Docker socket. The
tests inspect the actual environment/mounts/cgroup files and execute an unreachable
native network connection, allocation/fork/CPU/output pressure, timeout and
cancellation, including detached descendants. These settings follow Docker's
[run controls](https://docs.docker.com/engine/containers/run/) and
[resource controls](https://docs.docker.com/engine/containers/resource_constraints/).

After a command completes, PID 1 terminates remaining descendants and keeps tmpfs
alive for capture. A fixed service-owned reader streams an archive through
`docker exec`; `docker cp` alone omits this tmpfs on the accepted daemon. The host
accepts only contained regular files/directories, with 512 MiB total, 128 MiB per
file, 100,000 entries and a 30-second capture deadline. Excluded links/special
files are listed in `capture.json`; no ready artifact relies on them. This
preserves independently completed files without executing anything returned by
the worker. Completed capture is followed by container removal.

## Retained geometry and interruption

`DockerJob(..., ['session'])` exposes serialized file/JSON operations through its
`call` method: `ensure_geometry`, `evaluate_geometry`, `release_geometry`,
`inspect_geometry`, `diagnostics` and `restart`. Calls use `/inputs/...` request
paths and fresh `/output/...` result paths inside the container, plus an explicit
trusted caller scope. This is local process I/O, without an agent or network
framework. The native runtime owns the same immutable handles, pins, expiry,
eviction and generation checks as the local API.

Every successful ensure captures a durable host snapshot before returning its
handle descriptor (`durable_snapshot_path`). Images, metrics, camera/criterion
changes and STEP queries reuse the loaded native shapes. A render query can be
cancelled while keeping geometry usable. If the native runtime/container is lost,
old handles fail explicitly; known host snapshot paths remain available. Copy
the self-contained snapshot into the new private input set and request its
`geometry.path` to restore with a new handle and zero source executions.

Cooperative interruption finalizes partial service evidence before capture. A
kernel OOM or forced container kill may destroy unfinished tmpfs files; only
previously captured snapshots/artifacts survive. The host retains the container
failure/limit/cleanup report and never invents ready files. The acceptance tests
exercise both successful query cancellation and full-container loss followed by
an actual measured query on restored geometry.
