# Team Name

icrafty

# Project Description

icrafty is an app for turning repair and upgrade requests into CAD models for
3D printing. AI designs the solution first: it analyzes the problem, works out the
part's geometry and dimensions, and generates the code that builds the model.
The app redefines "broken" to include things that no longer fit your needs: a
missing cap, an awkward grip, or a design you want to upgrade.

Capture photos live from your camera or import existing images, then draw and add
annotations to show what needs fixing or changing. The AI analyzes the original
photos and your markings, asks for missing measurements, and uses Codex's native
image-generation tools to sketch possible solutions. Inspect or annotate a
generated sketch and send it back to refine the design in the same saved
conversation. Original photos and generated concepts remain available throughout
the discussion. The first demonstration focuses on a replacement mug cap.

The CAD workflow uses FreeCAD to build solid geometry, render views, compute
geometric checks, and export STEP files for print preparation. The app combines
live Codex chat, camera capture, editable annotations, inline measurement forms,
and an interactive STEP/STL viewer. The CAD agent has passed a separate correction
trial; integration with the main conversation and printer-specific preparation
remain ongoing.

# Public Project GitHub Repository

https://github.com/hmldns/icrafty


# 1-Minute Demo Video*

# Describe your use of OpenAI products, including GPT-6 Astra, to build the submitted project*

We used [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
through Codex for requirements analysis, system design, implementation, debugging,
and validation. Our [development workflow](../workflow/README.md) runs scoped Codex
builders in separate Git worktrees and persistent tmux windows. A director
coordinates assignments and reports; builders implement features and run
acceptance checks; a dedicated integration agent merges their commits and verifies
the combined app.

The app also runs GPT-6 Astra inside Codex, wrapped via the Agent Client Protocol
(ACP). Our Python backend uses `@agentclientprotocol/codex-acp`, which bridges ACP
to [Codex App Server](https://learn.chatgpt.com/docs/app-server). ACP carries
sessions, text and image prompts, streaming replies, and tool events into the
repair UI. MCP tools provide image access, camera requests, and structured
measurement questions. The [live acceptance record](../agent/LIVE-ACCEPTANCE.md)
reports `gpt-6-astra[max]`.

Astra analyzes the actual pixels of original photographs sent through ACP,
including live camera captures and annotated versions. It examines multiple
views and user markings, reasons about the part's fit and function, and asks for
missing dimensions. In our live mug-cap run, it inspected all four supplied
original photos, then requested five dimensions and two fit/use answers, with
hints explaining where to place the calipers. Exact dimensions come from the
user's measurements.

Astra also invokes Codex's native `Image generation` tool to create concept
sketches and visual explanations. Codex publishes the completed image files
through `crafty_images.publish_image` as saved chat assets that users can inspect,
annotate, download, and attach to later messages. Astra can then examine a
proposed design alongside the original photos and the user's feedback. We
verified a real pale-blue mug-cap concept with a finger tab, including its
generation, publication, download, and later reanalysis after the conversation
was restored. The measurement workflow also instructs Astra to generate labelled
schematics showing caliper placement, with labels tied to the measurement fields.
Original photos, generated concepts, and verified CAD renders retain their own
identities in the workflow.

For CAD work, the Codex agent writes FreeCAD Python, runs the evaluator,
inspects actual rendered images and numerical measurements, and revises its
design. FreeCAD builds and verifies the geometry and exports STEP; the AI owns
the design decisions and revision loop. Our
[separate cap trial](../cad/TRIAL-GATE.md) demonstrated one code revision correcting
failed dimensions, followed by all ten geometry checks passing and a validated
STEP export.

# Provide feedback from your experience using GPT-6 Astra.*
