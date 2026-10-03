"""Offline integrity checks for the versioned migration record; no remote writes."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8'))


def verify():
    source = load('docs/migration/gitlab-records.json')
    mapping = load('docs/planning/tracker-map.json')
    report = load('docs/migration/reconciliation.json')
    old = load('docs/planning/gitlab-map.json')
    assert report['errors'] == [], 'remote reconciliation has unresolved errors'
    assert len(source['issues']) == report['issues'] == 45
    assert len(source['merge_requests']) == report['historical_mr_records'] == 2
    assert len(mapping['tickets']) == len(old['tickets']) == 38
    numbers = [value['number'] for value in mapping['records'].values()]
    assert len(numbers) == len(set(numbers)) == 47, 'record mapping is not one-to-one'
    for ct, ticket in mapping['tickets'].items():
        assert ticket['source']['iid'] == int(old['tickets'][ct]['iid'])
        assert ticket['blockers'] == old['tickets'][ct]['blockers']
        assert ticket['gate'] == old['tickets'][ct]['gate']
        assert ticket['title'] == old['tickets'][ct]['title'], 'tracker title encoding/content drift'
        assert ticket['url'] == mapping['records'][f"issue:{ticket['source']['iid']}"]['url']
    assert report['blocker_edges'] == sum(len(t['blockers']) for t in mapping['tickets'].values())
    assert report['parent_edges'] == 38
    for gate, row in mapping['gates'].items():
        assert row['title'] == old['gates'][gate]['title'], 'gate title encoding/content drift'
    comments = sum(not n['system'] for ns in source['notes'].values() for n in ns)
    assert comments == report['user_comments'] == len(mapping['comments']) == 17
    assert sum(i['state'] == 'closed' for i in source['issues']) == 9
    assert len(source['labels']) == report['labels'] == 11
    inventory = load('docs/migration/gitlab-inventory.json')
    assert sum(n['system'] for ns in source['notes'].values() for n in ns) == inventory['issues']['system_notes']
    assert sum(len(notes) for notes in source['commit_comments'].values()) == inventory['commit_comments']['comments']
    assert len(source['project_events']) == inventory['other_inventory']['project_events']
    assert len(source['pipelines']) == inventory['pipelines']['count']
    assert sum(len(jobs) for jobs in source['jobs'].values()) == inventory['pipelines']['jobs']
    for original in source['issues']:
        destination = mapping['records'][f"issue:{original['iid']}"]
        assert destination['url'] == f"https://github.com/{mapping['project']}/issues/{destination['number']}"
    assert mapping['project'] == report['repo'] == 'kanakamedala-rajesh/codex-tandem'
    print('Migration integrity PASS: 45 issues, 2 MR archives, 17 comments, 38 parents, 47 blockers, 11 labels')


if __name__ == '__main__':
    verify()
