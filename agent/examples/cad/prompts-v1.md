# Dedicated CAD chat prompts

Use a newly created saved chat against the dedicated backend. These are prompts,
not recorded successes or substitutes for native evidence.

1. “Make a solid cylinder 20 mm in diameter and 20 mm high, in millimeters,
   centered on the Z axis with its base at Z=0. Delegate modeling to the CAD
   agent. Name the part body. Start with an isometric PNG and independently
   verify validity, one solid, X/Y diameter 20 mm, Z height 20 mm, and volume
   2000*pi mm³. Use 0.001 mm and 0.001 mm³ absolute tolerances. Inspect and
   publish the real evidence. Do not export STEP yet.”
2. “For that exact revision, give me a bottom view and a downloadable validated
   STEP. Reuse the saved geometry without rebuilding, and keep its identity.”
3. “Make a new revision with diameter 24 mm, retaining height 20 mm. Keep the
   earlier revision. Delegate the change to the CAD agent, verify the dimensions
   and volume 2880*pi mm³, and publish an isometric PNG.”
4. After deliberately stopping/reopening this dedicated session: “Restore the
   saved geometry of revision [actual revision ID] explicitly, then give me a
   new front view and dimensional checks without rerunning source.”

A separate cap prompt: “Make a closed-end cylindrical cap with outer radius
20 mm, bore radius 18 mm, total height 12 mm and roof 2 mm. Its cavity opens at
Z=0 and is 10 mm deep. Name the part cap and identify its actual bore,
inner_roof and outer_roof faces. Delegate modeling and inspection to the CAD
agent. Request isometric, bottom and front PNGs, including a three-panel grid,
with both JSON and inline labels. Independently check validity, one solid,
40×40×12 mm world bounds, bore diameter 36 mm, face-to-face roof 2 mm, bore
extent 10 mm and volume 1560*pi mm³. Use 0.001 mm/mm³ tolerances. No STEP yet.”

The exact request selectors for the cylinder are in
[request-part-v1.json](request-part-v1.json); full MCP schemas and the illustrative
application record sit beside it. The fixed cap fixture criteria, for deterministic
tests rather than live model source, remain in `cad/fixtures/cap/criteria.json`.
