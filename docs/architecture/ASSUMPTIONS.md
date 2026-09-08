# Critical architecture assumptions

This inventory reflects the local-file handoff discussed with the user. Tool
names below are proposed contracts. They are not implemented APIs. **Agreed**
identifies the requested direction, **Proposed** identifies an architectural
choice, and **Verify** identifies a capability that needs a live integration check.
Identifiers remain stable as decisions change.

**A-1 — Local files are the agent handoff. Agreed.** Download a stored image into
an agent-visible folder and let the agent open it. For output, accept a local file
path in an MCP submission tool, read its completed bytes, and put them into managed
storage. Apply this to generated images and STEP files. ACP inline image blocks
are an optional input mechanism; they are not required for this design.

**A-2 — Agent and file-facing MCP share a filesystem namespace. Proposed;
critical.** Run the file-facing MCP process beside Codex, using local stdio. Its
`asset_fetch(assetId)` returns a path that Codex can actually read, and its
`asset_publish(localPath, ...)` can read Codex output. A remote HTTP service cannot
interpret an arbitrary path from another container. CAD worker output therefore
needs an explicit transfer or a narrowly scoped shared mount before an agent-local
path is returned. The default here is explicit transfer through job staging.

**A-3 — Local image tools are available in the deployed Codex session. Verify;
first integration gate.** The adapter maps local image-view events and image
generation output with an optional `savedPath`. That supports the proposed path
flow, but does not establish that image generation is enabled for the chosen
model, account, and container configuration. Check that the agent opens a fetched
image, creates a sketch, discovers its actual output path, and publishes it. Do
not hardcode a presumed generation directory. If generation only returns bytes,
materialize a file before using the same submission contract.
[Adapter image event mapping](https://github.com/agentclientprotocol/codex-acp/blob/main/src/CodexToolCallMapper.ts).

**A-4 — Explicit submission creates a chat asset. Proposed.** Files in the agent
folder are working files. `asset_publish` copies one completed image into managed
storage and returns an asset ID and typed card reference. `model_publish` accepts
STEP and source paths and returns a publication operation while validation and
preview generation run. A folder watcher or an ACP image-generation notification
does not silently publish everything. The browser resolves stored asset IDs;
it never depends on an agent-local path.

**A-5 — Submission captures immutable bytes. Proposed; critical.** Freeze the
completed file set before ingestion. Store content length and digest, then commit
metadata and references only after the bytes are durable. Reusing a filename for
another draft creates a new asset or revision. Retrying the same submission uses
an idempotency key, so a lost response does not create duplicate cards. Restrict
path imports to configured workspace or image-output roots, reject path escapes,
and keep credentials outside those import roots. Local scratch is a cache and work
area; storage remains authoritative after a runtime is replaced.

**A-6 — CAD execution stays isolated; local submission does not choose its
location. Proposed implementation of PRD-29.** The conversational agent writes
FreeCAD Python, and `cad_build(sourcePath, inputs)` runs it in a bounded FreeCAD
worker. The tool makes completed STEP output available in the agent's folder;
`model_publish(stepPath, sourcePath, parentRevisionId)` can then submit it using
the same path-based mechanism as images. An already available local STEP plus
source can enter at submission. A build job and a publication job are separate:
creating a STEP file alone does not make a browser model ready.

**A-7 — STEP is the geometry source for published previews. Proposed; critical.**
A model revision freezes its STEP, FreeCAD Python source, parameter values, input
asset references, and parent revision. Generate the browser GLB and verification
images from that exact STEP, and associate them with one immutable manifest.
Record CAD units and the coordinate conversion: glTF uses meters and a Y-up
coordinate system. A fresh verifier process should parse STEP without executing
the generated Python. Reopening geometry checks file validity and shape properties;
physical fit still depends on measurements and later real-world validation.
[glTF coordinate system](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units).

**A-8 — Annotations are images with lineage, not edits in place. Proposed
implementation of PRD-17–19.** Keep the source photo or draft and store the flattened
annotated image as a new asset. Optional editable drawing data accompanies it.
Use a consistent normalized pixel coordinate system. A model snapshot records the
revision, preview digest, and camera pose. Its annotations are visual feedback;
they do not imply exact 3D coordinates. Caliper measurements and units must be
recorded explicitly, with estimated values distinguished from supplied ones.

**A-9 — One agent handles conversation and modeling initially. Proposed.** Use
one Codex session per chat to ask questions, inspect images, generate sketches,
write FreeCAD source, inspect rendered results, and revise the part. CAD execution
and preview generation are tools, not another reasoning agent. Chats in the same
repair share stored assets. Separate chat folders reduce accidental collisions;
they are not security boundaries between chats within the same project runtime.
A dedicated modeling agent remains a later option.

**A-10 — Application state outlives an ACP turn. Proposed; critical.** Persist
messages, assets, interactions, job attempts, revisions, and event cursors in the
backend. Tool cards refer to those records; a successful tool call or an agent's
claim does not set a revision to ready. A normal end of turn may leave an accepted
job processing. Proposed Stop behavior cancels the active turn and its unfinished
foreground jobs, prevents late publication, and preserves already published
revisions. This cancellation scope is a product choice, not automatic ACP behavior.

**A-11 — Isolation is enforced by mounts and service authority. Proposed.** The
agent runtime has project-scoped API access, its scratch space, and private Codex
state. It has no application database, global blob volume, host workspace, or
Docker socket. Generated-code workers receive only job inputs and bounded output
space, with no network or provider credentials. Resource limits must be set
explicitly. If a launcher controls Docker, that launcher is privileged and may
only accept fixed job manifests, never model-supplied host paths or launch flags.
A persistent bounded FreeCAD service is a possible simpler implementation; fresh
containers for every stage are a proposal, not a product requirement.
[Docker resource limits](https://docs.docker.com/engine/containers/resource_constraints/),
[Docker daemon authority](https://docs.docker.com/engine/security/).

**A-12 — Forms yield control instead of holding a tool call open. Proposed.**
An MCP tool creates a stored request containing image references, labels, size
fields, and open questions, then returns. The agent can finish its turn; submitting
the form or capture collection creates the next user message. Allow one active
prompt per chat. Start with Stop or wait-and-send controls; queued messages are
optional app behavior. This keeps a browser refresh from losing a pending input
request or leaving an unbounded MCP call waiting for a person.

**A-13 — First deployment stays small. Proposed.** Use a Python backend managed
with `uv`, SQLite metadata and event storage, a private blob volume, and one CAD
execution slot to start. Preserve owner and project IDs in every domain record
and check them on each API access. Only Caddy exposes public routes; the first
deployment needs an owner access gate even while full account management is
deferred. S3 storage, additional CAD capacity, and a printing MCP integration can
follow without changing asset or revision identities.
