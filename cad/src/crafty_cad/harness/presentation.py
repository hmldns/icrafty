"""Rich summaries of already-computed evidence; no CAD execution here."""

from rich.table import Table
from rich.tree import Tree

from ..files import load_json


def case_details(console, row, root):
    if row.get('reason'):
        console.print(row['reason'])
    if row['suite']=='geometry' and row.get('results'):
        path=root/row['results'][0]
        result=load_json(path)
        table=Table('Metric','Actual','Unit','Criterion','Outcome',title=row['case'])
        for metric in result['metrics']:
            table.add_row(metric['id'],str(metric['value']),metric['unit'],str(metric['criterion']),metric['status'])
        console.print(table)
        console.print(str(path))
    if row['suite']=='reuse':
        for runtime in row.get('runtime_diagnostics',[]):
            console.print('Retained geometry counts: '+str(runtime['counts']))


def artifact_tree(console, root, summary):
    tree=Tree(str(root))
    for name in ('summary.json','index.html','local-docker-comparison.json'):
        if (root/name).is_file():
            tree.add(name)
    files=tree.add('retained evaluator artifacts (first 40; full list in gallery)')
    count=0
    for row in summary['cases']:
        for relative in row.get('results',[]):
            path=root/relative
            if not path.is_file():
                continue
            for artifact in load_json(path)['artifacts']:
                for item in (artifact,artifact.get('annotations',{})):
                    if item.get('status')=='ready' and item.get('path') and count<40:
                        files.add(str((path.parent/item['path']).relative_to(root)))
                        count+=1
    console.print(tree)
