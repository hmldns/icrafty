"""Self-contained report gallery. Opening a report never executes CAD."""

import base64
import html
from pathlib import Path

from ..files import atomic_bytes, atomic_json, load_json


def publish(root: Path, summary: dict):
    atomic_json(root / "summary.json", summary)
    sections = []
    for case in summary["cases"]:
        body = f"<h2>{html.escape(case['suite']+' / '+case['case'])}</h2>"
        body += f"<p>{html.escape(case['outcome']+' — '+case['classification'])}</p>"
        if case.get("reason"):
            body += "<pre>" + html.escape(case["reason"]) + "</pre>"
        for relative in case.get("results", []):
            path = root / relative
            if not path.is_file():
                continue
            result = load_json(path)
            body += f'<p><a href="{html.escape(relative)}">Evaluator result</a>: {html.escape(result["execution"]["status"])}</p>'
            if result["metrics"]:
                body += "<table><tr><th>Metric</th><th>Actual</th><th>Unit</th><th>Criterion</th><th>Outcome</th></tr>"
                for metric in result["metrics"]:
                    body += "<tr>" + "".join("<td>"+html.escape(str(v))+"</td>" for v in
                        (metric["id"], metric["value"], metric["unit"], metric["criterion"], metric["status"])) + "</tr>"
                body += "</table>"
            for artifact in result["artifacts"]:
                body += f'<h3>{html.escape(artifact["id"])}: {html.escape(artifact["status"])}</h3>'
                if artifact["status"] == "ready":
                    target = path.parent / artifact["path"]
                    href = target.relative_to(root).as_posix()
                    body += f'<a href="{html.escape(href)}">{html.escape(artifact["kind"])} file</a> '
                    if artifact["kind"] == "png":
                        data = base64.b64encode(target.read_bytes()).decode()
                        captions = " | ".join(v["title"].replace("\n", "; ") for v in artifact["views"])
                        body += f'<figure><img src="data:image/png;base64,{data}" alt="{html.escape(captions)}"><figcaption>{html.escape(captions)}</figcaption></figure>'
                        sidecar = artifact.get("annotations", {})
                        if sidecar.get("status") == "ready":
                            href = (path.parent / sidecar["path"]).relative_to(root).as_posix()
                            body += f'<a href="{html.escape(href)}">Annotation records</a>'
                elif artifact.get("reason"):
                    body += "<pre>"+html.escape(artifact["reason"])+"</pre>"
        sections.append("<section>"+body+"</section>")
    document = ("<!doctype html><html lang=en><meta charset=utf-8><title>Crafty CAD verification</title>"
        "<style>body{font:16px system-ui;max-width:1100px;margin:40px auto;background:#edf2f7;color:#192b3c}"
        "section{background:white;padding:24px;margin:24px 0;border-radius:12px}img{max-width:100%;height:auto}"
        "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:6px;text-align:left}"
        "pre{white-space:pre-wrap}figcaption{font-size:13px}a{color:#1752a0}</style>"
        f"<h1>Crafty CAD verification</h1><p>{html.escape(summary['outcome'])} · {summary['duration_seconds']:.3f} s</p>"
        '<p><a href="summary.json">Machine summary</a></p>'+"".join(sections)+"</html>")
    atomic_bytes(root / "index.html", document.encode())
