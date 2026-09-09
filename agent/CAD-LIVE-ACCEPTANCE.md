# Local live chat-to-CAD acceptance

The dedicated saved chat completed the real conversational Codex → separate CAD Codex session → MCP → native FreeCAD route: requested images/STEP, warm evidence reuse, a separate revision, cancellation and explicit recovery. Test-actor transport checks are recorded separately. The execution profile is local process/workspace separation; product per-session Docker orchestration is not implemented.

Review the same saved chat at [the mounted repair workspace](http://localhost:5217/?repair=54c4b8b46c6c4d7dbdcdb3289c6ca996). The dedicated backend is `http://127.0.0.1:8807`, with state solely in this worker checkout's `.builders/cad-chat-state`. Main 5187/8787 and its private saved chats were not used. The UI owner inspected this same native run without requesting a duplicate model.

## Identities and retained route

Application session: `54c4b8b46c6c4d7dbdcdb3289c6ca996`. Conversational ACP session: `01a08371-a01b-7220-ae65-a4a0cab483eb`. Separate CAD ACP session: `01a0837b-24c8-7771-b982-d57f338170aa`, CAD application session `d57ecec5e266476cafb5c99a85e2b988`. Both used `gpt-6-astra[max]` through the actual pinned `@agentclientprotocol/codex-acp` adapter 1.10.0. FreeCAD was the evaluator, not another reasoning agent.

The CAD agent wrote model source, called model-role MCP, read measured JSON, inspected actual PNGs and published selected evidence. The parent fetched and inspected the published images. Public command/file/image-view events are retained in each operation's bounded `cad-visible.jsonl`. Credential homes and private provider state are excluded from the collector.

Final evidence is under `.builders/cad-chat-acceptance/final-native-and-input/`: `report.json`, `snapshot.json`, self-contained `gallery.html`, `operations/`, `artifacts/`, and `native/`. It contains nine operations and **21/21 verified downloads**. The gallery embeds the actual PNG/STEP/sidecar bytes. The preceding `checkpoint-fc25636/` retains its then-accurate WIP status. Original evaluator paths are `.builders/cad-chat-state/cad/operations/<operationId>/evaluations/<evaluationId>/result.json`.

After all acceptance, only the idle dedicated backend on 8807 was refreshed to serve the installed file-handoff tools. `backend-before-refresh.json` and `backend-refresh.json` retain the check: the saved record history and conversational ACP ID are unchanged, no turn is active, the input upload route is registered, health is ready, and the earlier STEP still matches its 5,177-byte digest. This refresh submitted no modeling prompt and touched no main runtime. The same saved chat remains available for review.

## Actual operations

Counts are source executions / builds / loads / restores / queries. Criterion outcomes are independent of operation completion.

| Operation | Outcome and purpose | Counts |
| --- | --- | --- |
| `ca260d227a9c47a38b85ade83ce60deb` | Completed: first cap, four PNGs, nine passing criteria, no STEP | 1 / 1 / 1 / 0 / 1 |
| `f7bc4c7b38e04455b7607b26717a10fb` | Completed: changed camera and validated STEP of revision 1 | 0 / 0 / 0 / 0 / 1 |
| `96495b7d42294763ae2aab6101a12201` | Completed: revision 2, bore radius 18.2 mm | 1 / 1 / 1 / 0 / 1 |
| `8e62a77bb18341b7963592b1cc714df7` | Completed: explicit revision 2 restore after Stop | 0 / 0 / 1 / 1 / 0 |
| `3dece7a4546c4f15a954f92b33a67734` | Completed: restored right-view PNG and passing checks | 0 / 0 / 0 / 0 / 1 |
| `238d461cccd343ba8b42fbce6746436f` | Cancelled after the actual CAD session resumed; no new revision | 0 / 0 / 0 / 0 / 0 |
| `02e90eda943e4d3798a1da1234861031` | Failed explicitly: expired handle, geometry_unavailable | 0 / 0 / 0 / 0 / 0 |
| `0fe608ce39454a869bc525de184fea3b` | Completed: explicit restore after expiry | 0 / 0 / 1 / 1 / 0 |
| `cc413f69227540018277eb19b0a1ab18` | Completed: diagnostic PNG, failed bore criterion and unavailable selection | 0 / 0 / 0 / 0 / 1 |

Revision 1 is `08b2ec152eda4ae5a97c7cf75e44743e`, evaluation `53ae288ca74d43a9a1d8cbcee2e17bb2`, geometry digest `a81968c519bbbef7fdf3929812592fabebc1f423ff7d0b19e97b81836c4476ad`. Actual measurements: valid, one solid, **40 × 40 × 12 mm**, identified bore face **36 mm**, roof face distance **2 mm**, cavity **10 mm**, volume **4900.884539600079 mm³** against `1560*pi`. Numeric criteria retain 0.001 absolute tolerance in their stated units; validity/count are exact. The builder inspected isometric, bottom, front and grid PNGs, with readable camera titles and feature labels. No STEP was requested or offered.

Warm evaluation `8abc8bae6f124c3297e26a52d99aabef` retained source/revision/geometry identity. The requested 44 mm span is **vertical**, with resolved horizontal span 79.710 mm. Native query time was **0.621621 s**, with zero source/build/load/restore. `cap_step.step` is **5,177 bytes**, SHA-256 `b720f7a98e079cf9f3832e49c06ff1b83e31f9ac81bc40451b735c8b7f892da7`. Artifact ID `73f34970f3cd42229eb36b468f5509f2` uses `/api/agent/sessions/<sid>/cad/artifacts/<id>[?download=true]`. Clean reopen passed mm units, validity, count, bounds and volume (4900.8845396000725 mm³), using 1e-6 mm / 1e-5 mm³ absolute and 1e-9 relative tolerances. Collector and actual browser download verified the same bytes.

Revision 2 is `1bf85a760a6b453ab3fea7c0f62f84ac`, parent revision 1, evaluation `1612373a5b0c427aae21994ef98434f2`, geometry digest `81fdb4d6802a18387b6410e0ba17d1efb0a028681a169b8f3cf168194601d3fd`. The same CAD session changed the bore radius to 18.2 mm. Actual bore **36.4 mm**, volume **4673.43323148018 mm³**, all nine criteria pass. The builder inspected its isometric/bottom/grid PNGs. It did not request STEP; revision 1's download remained intact.

Both modeling operations used one evaluation within the 8-evaluation/1200-second limit. Their elapsed times were **172.208674 s** and **114.952240 s**. First native build took 0.268512 s and query 1.685434 s; revision 2 query took 1.343948 s.

## Recovery, cancellation and negative evidence

Public session Stop took **0.110185 s**, shutting down only this session's owned processes. Explicit restore took **0.278142 s**, retained revision/geometry identity and ran no source. The conversational ACP ID resumed at generation 3. A later modeling request resumed the original CAD ACP ID at generation 2 before cancellation, proving actual product-session recovery. Cancellation returned in **0.027242 s**, before any evaluation/source execution, retained prior evidence and marked the requested output unavailable/cancelled. Details are in `.builders/cad-chat-acceptance/{recovery,cancellation}/`.

After normal five-minute handle idle expiry, evidence failed explicitly with `geometry_unavailable` and no source fallback. The parent restored the known snapshot in **0.144340 s**, then retried. Evaluation `12cd177de9784c0d84e43fb2294bf5c8` returned a ready bottom PNG: actual bore 36.4 mm **failed** the intentional 36.0 ± 0.001 mm criterion, signed difference +0.4 mm. A nonexistent feature returned **unavailable**, null value, `missing_or_ambiguous_feature`. The operation completed; visible fail/unavailable labels were inspected.

The very first UI attempt guessed invalid selectors (`png_grid`, string view, `abs_tol`). Strict validation rejected it before any CAD operation/source execution. The cancelled turn is retained at `.builders/cad-chat-acceptance/first-selector-failures.json`. The fix exposed exact schemas in both workspaces and an MCP resource; this same conversation then resumed for the native run.

## Mounted renderer evidence

The UI owner's checkout retains `agent/runs/native-cad-ui-first/inspection.json`: four real PNGs, nine passing checks, scoped annotation links, no STEP, no browser page errors. `agent/runs/native-cad-ui-step/viewer-ready.json` and `native-step-viewer-ready.png` establish the actual mounted STEP viewer and matching browser download. The older `native-cad-ui-step/inspection.json` records an OCCT worker-cache 504. The owner fixed caching/prebundling in `570d6a75665da93131884f2f36a477d47baacfaa`; both outcomes remain retained. Mock renderer tests did not substitute for these native/UI results.

## Backend and repeatable collection

The final backend set passed **50 tests in 49.34 s**, exit 0, no skips:

```sh
env -u VIRTUAL_ENV uv run --directory agent --cache-dir .uv-cache --locked pytest -q \
  tests/test_cad_inputs.py tests/test_cad_input_transport.py tests/test_cad_backend.py \
  tests/test_cad_transport.py tests/test_integration.py \
  --basetemp runs/cad-integration-final --junitxml runs/cad-integration-final.xml
uv run --script agent/tests/cad_collect.py \
  --session 54c4b8b46c6c4d7dbdcdb3289c6ca996 \
  --output .builders/cad-chat-acceptance/final-native-and-input \
  --state-root .builders/cad-chat-state
```

Use fresh output names. Tests include actual native/MCP execution, explicit manual modeling actors and fake ACP lifecycle cases. They cover immutable capture/upload, digests, per-file/aggregate limits, session/task scope, cancellation fencing and original-byte retention. The gallery addition has separate targeted transport evidence in `agent/runs/cad-collector-gallery-final.xml`. The approved additive handoff is documented in [CAD-INTEGRATION.md](CAD-INTEGRATION.md); `cad.result` v1 is unchanged.

The authorized supplied STEP copy separately passed real MCP/native transport in **36.38 s**: measured 70 × 70 × 16 mm, actual PNG and validated STEP, one source/build/load/query. This used a manual test actor, not another live modeling generation. Its evidence and native corrections are in [NATIVE-IMPORT-FIX.md](../cad/NATIVE-IMPORT-FIX.md). Serial meshing, geometric extrema, adaptive mass integration and exact STEP trimming curves passed updated **78 local / 84 Docker** gates without relaxing limits. Native setup now requires `make -C cad native-setup`; see [native/README.md](../cad/native/README.md). Earlier live bytes remain unchanged.

Native versions: FreeCAD 1.1.3 revision 44987, OCCT 7.9.3, Python 3.14.7. Supervisor Python 3.13.9, MCP 1.30.0, Pillow 12.3.0, NumPy 2.5.3, FreeType 2.14.3 and Liberation Sans 2.1.5. Each result retains effective settings and actual commands. Native limits remain 30-second calls, 1 GiB memory, 32 processes, 16 MiB input, 128 MiB output, bounded logs and explicit snapshot recovery.

Unsupported GLB, threads/bolt families, physical fit, printing and product container orchestration remain outside this acceptance. Interrupted reasoning/source is never automatically replayed.
