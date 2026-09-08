# Crafty architecture

These diagrams and notes develop the [product requirements](../PRD.md).
They describe a proposed implementation, not running application services.
The [critical assumptions](ASSUMPTIONS.md) distinguish agreed file handoff behavior
from decisions and runtime capabilities that still need verification.

![Deployment and isolation boundaries](rendered/overview.svg)

- [Deployment and isolation](rendered/overview.svg) · [PlantUML](overview.puml) · [PNG](rendered/overview.png)
- [ACP conversation and local file handoff](rendered/acp-turn.svg) · [PlantUML](acp-turn.puml) · [PNG](rendered/acp-turn.png)
- [Images and annotation lineage](rendered/assets.svg) · [PlantUML](assets.puml) · [PNG](rendered/assets.png)
- [CAD build and model publication](rendered/models.svg) · [PlantUML](models.puml) · [PNG](rendered/models.png)
- [Turn cancellation and recovery](rendered/turns.svg) · [PlantUML](turns.puml) · [PNG](rendered/turns.png)
- [ACP implementation notes and first integration checks](ACP.md)

From the project root, `make diagrams` or `make architecture` renders SVG and PNG files.
`make diagrams-check` checks PlantUML syntax. `make diagrams-svg`,
`make diagrams-png`, and `make diagrams-clean` operate on those outputs separately.
Inside this directory, use `make`, `make svg`, `make png`, `make check`, or `make clean`.

Rendering requires Make, a recent PlantUML CLI supporting the long options in the
Makefile, Java, and Graphviz. Override `PLANTUML` if needed, for example
`make diagrams PLANTUML='java -jar /path/to/plantuml.jar'`.
Generated renders live beside the sources in `rendered/`.
The commands use the local renderer; diagrams are not submitted to a rendering service.
See the [PlantUML command-line reference](https://plantuml.com/command-line).

Python application and integration tooling will use `uv`; rendering itself does
not require Python. The original idea document is preserved.
