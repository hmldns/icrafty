# Separate cap correction trial acceptance

CAD-RUN-14 passed on 2026-09-08. The separate `cad-cap-correction` worker used
service checkpoint `aeecdf71ecec065dbcca00b498e0ba2a7edaf90a`, included in its
baseline `7dfa335388224fd151fbcda562cac510d21089c9`. The service builder did not
launch or perform the correction. Docker acceptance remains the next required gate.

The collector recorded **2/8 evaluations** and **135.27897667884827/1200 seconds**.
The unchanged wrong source failed seven of ten fixed checks. After inspecting
the actual measurements and images, the worker revised its source and the second
evaluation passed all ten criteria, with measured centroid and validated STEP.
Both evaluator calls, collector finish, original verify and service verify exited 0.
The first evaluator's exit 0 represents completed execution with failed criteria.

Service verification command, from this worker checkout:

```sh
CRAFTY_CAP_TRIAL=/home/hmldns/devel/sandbox/crafty/.worktrees/cad-service/cad/runs/trials/received-cap-correction-001 \
  make -C cad trial-cap
```

The received directory is a digest-checked copy of the original trial under the
other worker's checkout. Original files were not changed. It retains all frozen
requests, sources, criteria, native snapshots, logs, PNGs/sidecars, observations,
STEP/comparison, original trial result, service gate logs, file receipt, and the
worker's tracked handoff. `summary.json` records service review and `index.html`
is a self-contained gallery. The service builder opened both real image grids;
their isometric, bottom and side panels show the closed end and concentric bore
boundary, with legible actual measurement callouts.

Final actual measurements: valid single solid; extents 40 × 40 × 12 mm;
bore diameter 36 mm; roof face distance 2 mm; cavity depth 10 mm;
volume 4900.884539600079 mm³; area 5152.211951887267 mm²;
centroid approximately (0, 0, 8.076923076923077) mm. The unchanged criteria digest
is `eeeacc18825eb0aa918f20b478d4b7f98cf6af86a25eb46c717ceb4d359ed118`.
Independent tolerances remain in [fixture expectations](fixtures/EXPECTATIONS.md).
Clean STEP reopen passed explicit mm units, validity, solid count, bounds and
volume; reopened volume is 4900.8845396000725 mm³. Final STEP SHA-256:
`b11fa538413bcbdfcd9e2de5489506b7a1bcd0097a4480b45cd19c88feaa0708`.

## Independent visible transcript

The integration agent captured original public records for thread
`01a082fe-8bc8-73d2-b4cf-00fea407e0f5`, through
`2026-09-08T21:54:42.917Z`. The capture excludes hidden reasoning and
system/developer data. A byte-identical copy is retained in the received trial's
`external-transcript/`, together with metadata, exporter and SHA256SUMS.

The service builder verified all **102** original record digests against the
metadata and checked the actual commands/results, source patch, and all **8**
image-view events. Export lines 40/61 are the two public collector evaluations;
44/63 read their actual results; 47–50 and 66–69 are four image views per
iteration; 55 records baseline observation before source revision at 59;
70 reads the STEP comparison; 74 records final observation; 79/82 are successful
finish/verify. No additional modeling run appears in the captured trial.

- Visible JSONL SHA-256:
  `70b340f918d85dcd96780ff76b06eff2e4b15adf1080fdfc40d25b6d93987cc6`.
- Metadata SHA-256:
  `91cf336271ffc95c1ffa136f847a8640972eaf5876f3a24a320ad2c836c87af0`.
- Original `trial-result.json` SHA-256:
  `39ea688097279e04aa5651c070cbec7e2ab453c3c5c20d818572eb951d913703`.

The service review also checked baseline/source identities, request/source frozen
copies, fixed criteria, all result/artifact digests, observation image/result
correspondence and chronological inspection records. No service defect or
unresolved trial question was found. This synthetic trial establishes the bounded
inspect-and-revise loop; physical fit and manufacturing suitability are outside
its criteria. Its separate Git handoff is owned by integration and does not change
the accepted runtime evidence.
