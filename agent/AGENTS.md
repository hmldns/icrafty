# Agent integration module

Read [M-ACP](../docs/M-ACP.md) and [state ownership](../docs/ACP-AGENT-STATE.md).
This Python/uv package owns the local runtime, application API, persistence,
ACP normalization, and sample MCP tools. Keep it independent of React, CAD
implementation, and the development-worker workflow.

Persist commands before dispatch and keep runtime, turn, tool, and asset identities
separate. Never replay uncertain prompts automatically. Preserve partial tool
updates. File bytes and domain records are authoritative; assistant prose is not.
Use private session directories, explicit configuration, bounded process I/O,
and scoped MCP credentials. Do not log credentials or image base64 payloads.

Use uv and the locked Node adapter. Tests use explicit fake ACP processes;
live acceptance uses the actual authenticated adapter and retains its evidence.
Document local-only limits honestly; process directories are not Docker isolation.
