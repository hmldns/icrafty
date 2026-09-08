# Frontend conventions

This folder is the Crafty frontend: TypeScript, React, Vite, and Tailwind, following
the product requirements in `docs/PRD.md` at the repository root. Keep the first
build focused on useful, working interactions. Add Three.js when a model-viewing
feature needs it.

## Structure and components

- Put application code in `src/` within this frontend package. Keep route pages in
  `src/pages/`, reusable UI primitives in `src/components/ui/`, feature components
  in `src/features/`, and shared styles in `src/styles/`.
- Use small, named, typed components with clear props. Route components compose
  features; hooks own browser lifecycles and stateful behavior; pure helpers own
  image geometry, serialization, and validation.
- Keep camera capture, image intake, the image collection, and annotation editing
  independently understandable. Avoid a large component that owns every concern.
- Prefer semantic HTML, explicit button types, visible focus, descriptive labels,
  keyboard controls, and accessible dialogs. Clean up listeners, object URLs, and
  media tracks when their owners unmount or replace resources.

## Design system

- Define colors, typography, spacing, radii, and shadows centrally as CSS tokens.
  Use Tailwind's Vite integration and a shared stylesheet for reusable semantic
  component classes. Avoid scattered arbitrary color values and repeated long
  utility strings.
- Centralize variants in UI primitives (buttons, fields, panels, badges, dialogs)
  so the gallery and feature routes exercise the same components and styles.
- Support compact and wide screens. Use native browser capabilities where they
  fit; add dependencies only for a clear benefit.

## Browser features and assets

- Ask for camera access only through an explicit user action. Handle denied,
  missing, busy, and unsupported cameras. Stop tracks when the camera closes or
  the route changes. Keyboard capture must not intercept text input.
- Keep source image identity and editable annotations separate from exported
  image pixels. Preserve source references when saving annotated revisions.
- Validate imported images. Use browser-safe cross-origin image loading; surface
  actionable failures and never pretend a blocked image was imported or saved.
- Keep this spike independent of account systems and external application SDKs.

## Commands and checks

Provide npm scripts for development, type checking, production builds, and tests,
with a committed lockfile. Use port 5187 for local development, 4187 for preview,
and 5287 for isolated browser tests; require strict ports. `make mf` at the repo
root starts the frontend. Test meaningful camera cleanup, image intake, annotation
history/export, and route behavior; browser tests should use fake media devices.
