# Architecture decision index

The technical requirement inventory now lives in [TRD.md](../TRD.md).
These existing identifiers remain as navigation pointers for the assumption
discussion. TRD statuses distinguish confirmed direction from proposed details
and open integration checks.

**A-1 — Local file handoff.** Confirmed direction: TRD-14 and TRD-15.

**A-2 — Filesystem visibility.** Session-local MCP and explicit transfers:
TRD-7, TRD-8, and TRD-14.

**A-3 — Image tool availability.** Runtime verification remains open:
TRD-15 and TRD-33.

**A-4 — Publication.** Selected images, reports, previews, and optional exports:
TRD-18. A STEP file is not required for every result.

**A-5 — Immutable bytes and persistence.** Asset ingestion and publication:
TRD-17 and TRD-18. Recoverable session mounts: TRD-8 and TRD-9.

**A-6 — FreeCAD evaluation loop.** Confirmed service role and selective outputs:
TRD-21 through TRD-25.

**A-7 — Geometry provenance.** All outputs reference their evaluated geometry:
TRD-24, TRD-26, and TRD-27. Early images and metrics do not depend on STEP.

**A-8 — Annotations and source context.** Product behavior: PRD-17 through
PRD-20. Technical representation: TRD-17.

**A-9 — Agent separation.** Separate conversational and CAD agents are confirmed:
TRD-5 and TRD-13. Each session gets its own container under TRD-7.

**A-10 — State and Stop.** Independent state, proposed cancellation policy,
publication races, and recovery: TRD-28 through TRD-31.

**A-11 — Isolation and orchestration.** Session mounts and lifecycle:
TRD-7 through TRD-12. FreeCAD isolation and container authority: TRD-25 and TRD-32.

**A-12 — User input.** Durable forms, clarification routing, and serialized
per-session prompts: TRD-20.

**A-13 — Initial deployment.** Stack and hosting: TRD-1 through TRD-4.
Storage default and remaining implementation choices: TRD-16 and TRD-36.
