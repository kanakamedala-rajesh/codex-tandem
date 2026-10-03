"""One-project tracker migration. Default is a read-only plan; --apply writes GitHub.

Raw input and mutable checkpoints belong outside the repository. Authentication
stays with gh; no token values are accepted, logged, or persisted by this tool.
"""

import argparse
import hashlib
import http.client
import json
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import quote

SOURCE = 'https://gitlab.com/venkata-sudha/codex-tandem'
PROJECT = 87154127
IDENTITIES = {'rajesh-kanakamedala': 'kanakamedala-rajesh'}
ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    temporary.replace(path)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def marker(kind, identity):
    return f'<!-- gitlab-migration:{PROJECT}:{kind}:{identity} -->'


def rewrite(body, mapping, repo):
    """Rewrite this project's links only; retain external and evidence provenance."""
    body = body or ''
    base = f'https://github.com/{repo}'

    def issue_url(match):
        kind = 'mr' if match[1] == 'merge_requests' else 'issue'
        key = f'{kind}:{match[2]}'
        if key not in mapping:
            raise ValueError(f'Unmapped source reference {key}')
        return mapping[key]['url']

    body = re.sub(re.escape(SOURCE) + r'/-/(work_items|issues|merge_requests)/(\d+)', issue_url, body)
    body = body.replace(SOURCE + '/-/blob/', base + '/blob/')
    body = body.replace(SOURCE + '/-/tree/', base + '/tree/')
    body = body.replace(SOURCE + '/-/commit/', base + '/commit/')
    # Bare local references must not be mistaken for URL fragments or code paths.
    def local_ref(match):
        kind = 'issue' if match[1] == '#' else 'mr'
        key = f'{kind}:{match[2]}'
        if key not in mapping:
            raise ValueError(f'Unmapped local reference {key}')
        return f"[{'GitLab MR ' if kind == 'mr' else ''}{match[1]}{match[2]}]({mapping[key]['url']})"
    # Preserve Markdown labels, code and URL anchors; only translate prose refs.
    protected = r'(```[\s\S]*?```|`[^`\n]*`|\[[^\]\n]*\]\([^\s)]*\)|https?://[^\s<>]+)'
    parts = re.split(protected, body)
    for index in range(0, len(parts), 2):
        parts[index] = re.sub(r'(?<![\w/=&?])([#!])(\d+)\b', local_ref, parts[index])
    body = ''.join(parts)
    return body


def assignees(item):
    return [IDENTITIES[user['username']] for user in item.get('assignees', [])]


def issue_body(item, mapping=None, repo=None):
    body = item.get('description') or ''
    if mapping is not None:
        body = rewrite(body, mapping, repo)
    who = (item.get('author') or {}).get('username', 'unknown')
    return (f"{marker('issue', item['id'])}\n"
            f"Imported from [GitLab #{item['iid']}]({item['web_url']}). "
            f"Original author: `{who}`; created: `{item['created_at']}`; "
            f"updated: `{item['updated_at']}`; original type: `{item['issue_type']}`.\n\n"
            f"{body}")


def comment_body(note, source_url, mapping, repo):
    who = (note.get('author') or {}).get('username', 'unknown')
    return (f"{marker('note', note['id'])}\n"
            f"Imported [GitLab comment]({source_url}#note_{note['id']}) by "
            f"`{who}` at `{note['created_at']}`.\n\n" + rewrite(note['body'], mapping, repo))


def mr_body(item, mapping=None, repo=None):
    body = item.get('description') or ''
    if mapping is not None:
        body = rewrite(body, mapping, repo)
    return (f"{marker('mr', item['id'])}\n"
            f"Historical GitLab merge request [!{item['iid']}]({item['web_url']}). "
            "This is an archive record, not a recreated GitHub pull request.\n\n"
            f"Original state: **{item['state']}**. Original author: "
            f"`{item['author']['username']}`. Created: `{item['created_at']}`; "
            f"merged: `{item.get('merged_at')}`.\n"
            f"Source: `{item['source_branch']}`; target: `{item['target_branch']}`.\n"
            f"Original merge commit: `{item.get('merge_commit_sha')}`.\n\n{body}")


class GitHub:
    def __init__(self, executable, repo, apply):
        self.executable, self.repo, self.apply = executable, repo, apply
        self.writes = 0
        self.connection = None
        self.headers = None

    def request(self, path, method='GET', payload=None):
        if method != 'GET' and not self.apply:
            raise RuntimeError('Writes require --apply')
        if self.headers is None:
            # Read the selected gh credential into memory only; never emit it.
            login = subprocess.run([self.executable, 'auth', 'token', '--hostname', 'github.com'],
                                   capture_output=True, text=True, encoding='utf-8')
            if login.returncode or not login.stdout.strip():
                raise RuntimeError('GitHub CLI authentication unavailable')
            self.headers = {'Authorization': 'Bearer ' + login.stdout.strip(),
                            'Accept': 'application/vnd.github+json',
                            'Content-Type': 'application/json', 'User-Agent': 'codex-tandem-migration'}
        for attempt in range(3):
            if self.connection is None:
                self.connection = http.client.HTTPSConnection('api.github.com', timeout=60)
            try:
                self.connection.request(method, '/' + path,
                                        body=None if payload is None else json.dumps(payload).encode(),
                                        headers=self.headers)
                response = self.connection.getresponse()
                raw = response.read()
            except (OSError, http.client.HTTPException):
                self.connection.close()
                self.connection = None
                # A write may have reached GitHub; never replay it blindly.
                if method != 'GET' or attempt == 2:
                    raise RuntimeError(f'{method} {path}: connection failed; reconcile before retry') from None
                time.sleep(2 * (attempt + 1))
                continue
            if response.status < 400:
                break
            if method == 'GET' and response.status in (429, 500, 502, 503, 504) and attempt < 2:
                delay = int(response.getheader('Retry-After', str(10 * (attempt + 1))))
                if delay <= 60:
                    time.sleep(delay)
                    continue
            # Never echo request body, credentials, or arbitrary remote error text.
            raise RuntimeError(f'{method} {path}: HTTP {response.status}; '
                               'state retained; inspect/reconcile before retry')
        if method != 'GET':
            self.writes += 1
            time.sleep(1.1)
        return json.loads(raw) if raw.strip() else None

    def get_all(self, suffix):
        items, page = [], 1
        while True:
            join = '&' if '?' in suffix else '?'
            batch = self.request(f'repos/{self.repo}/{suffix}{join}per_page=100&page={page}')
            if not isinstance(batch, list):
                raise ValueError('Expected a paginated array')
            items.extend(batch)
            if len(batch) < 100:
                return items
            page += 1

    def write(self, suffix, payload, method='POST'):
        return self.request(f'repos/{self.repo}/{suffix}', method, payload)


def identify(items, token):
    found = [item for item in items if token in (item.get('body') or '')]
    if len(found) > 1:
        raise ValueError('Duplicate migration marker: ' + token)
    return found[0] if found else None


def recover(items, token, checkpoint=None):
    """A saved destination ID takes precedence over mutable body markers."""
    found = identify(items, token)
    if checkpoint is not None:
        by_id = [item for item in items if item['id'] == checkpoint['id']]
        if len(by_id) != 1 or found is None or found['id'] != checkpoint['id']:
            raise ValueError('Checkpointed destination deleted or marker edited; refusing duplicate')
    return found


def entry(item):
    return {key: item[key] for key in ('id', 'node_id', 'number')} | {'url': item['html_url']}


def check_managed(current, expected, previous=None):
    """Only initial or checkpointed content can be updated on resume."""
    if current != expected and current != previous:
        raise ValueError('Destination was edited outside this migration; refusing overwrite')


def migrate(args):
    source = Path(args.source)
    issues = sorted(read(source / 'issues.json'), key=lambda x: x['iid'])
    mrs = sorted(read(source / 'merge_requests.json'), key=lambda x: x['iid'])
    labels = read(source / 'labels.json')
    oldmap = read(ROOT / 'docs/planning/gitlab-map.json')
    notes = {str(i['iid']): read(source / f"issue-{i['iid']}-notes.json") for i in issues}
    snapshot = {'issues': issues, 'mrs': mrs, 'labels': labels, 'notes': notes}
    fingerprint = digest(snapshot)
    state_path = Path(args.state)
    state = read(state_path) if state_path.exists() else {
        'repo': args.repo, 'source_sha256': fingerprint, 'mapping': {}, 'bodies': {}, 'comments': {}}
    if state['repo'] != args.repo or state['source_sha256'] != fingerprint:
        raise ValueError('Checkpoint belongs to another destination or source snapshot')
    api = GitHub(args.gh, args.repo, args.apply)
    destination = api.request('repos/' + args.repo)
    if destination['visibility'] != 'private':
        raise ValueError('This migration requires a private destination')
    if not args.apply and not args.verify:
        print(json.dumps({'mode': 'plan', 'issues': len(issues), 'mrs': len(mrs),
                          'comments': sum(not n['system'] for ns in notes.values() for n in ns),
                          'source_sha256': fingerprint, 'repo': args.repo}))
        return
    mapping = state['mapping']
    state.setdefault('states', {})
    state.setdefault('labels_done', [])
    existing = api.get_all('issues?state=all')
    if args.apply:
        existing_labels = {i['name']: i for i in api.get_all('labels')}
        for label in labels:
            expected = {'name': label['name'], 'color': label['color'].lstrip('#'),
                        'description': label.get('description') or ''}
            prior = existing_labels.get(label['name'])
            if prior is None:
                api.write('labels', expected)
            elif any((prior.get(k) or '') != v for k, v in expected.items()):
                if label['name'] in state['labels_done']:
                    raise ValueError('Destination label drift: ' + label['name'])
                api.write('labels/' + quote(label['name'], safe=''), expected, 'PATCH')
            if label['name'] not in state['labels_done']:
                state['labels_done'].append(label['name'])
                save(state_path, state)
        for kind, collection, body_fn in [('issue', issues, issue_body), ('mr', mrs, mr_body)]:
            for item in collection:
                key = f"{kind}:{item['iid']}"
                body = body_fn(item)
                title = item['title'] if kind == 'issue' else f"[GitLab MR !{item['iid']} — merged archive] {item['title']}"
                found = recover(existing, marker(kind, item['id']), mapping.get(key))
                if found is None:
                    found = api.write('issues', {'title': title, 'body': body, 'labels': item['labels'],
                                                 'assignees': assignees(item)})
                    existing.append(found)
                elif found['title'] != title:
                    raise ValueError('Destination title drift: ' + key)
                if key in mapping and mapping[key] != entry(found):
                    raise ValueError('Destination identity drift: ' + key)
                mapping[key] = entry(found)
                state['bodies'].setdefault(key, body)
                state['states'].setdefault(key, 'open')
                save(state_path, state)
        for kind, collection, body_fn in [('issue', issues, issue_body), ('mr', mrs, mr_body)]:
            for item in collection:
                key = f"{kind}:{item['iid']}"
                number = mapping[key]['number']
                current = api.request(f'repos/{args.repo}/issues/{number}')
                expected = body_fn(item, mapping, args.repo)
                check_managed(current['body'], expected, state['bodies'][key])
                expected_state = 'closed' if item['state'] in ('closed', 'merged') else 'open'
                check_managed(current['state'], expected_state, state['states'][key])
                if current['body'] != expected or current['state'] != expected_state:
                    api.write(f'issues/{number}', {'body': expected, 'state': expected_state}, 'PATCH')
                state['bodies'][key] = expected
                state['states'][key] = expected_state
                save(state_path, state)
        for item in issues:
            number = mapping[f"issue:{item['iid']}"]['number']
            existing_comments = api.get_all(f'issues/{number}/comments')
            for note in sorted(notes[str(item['iid'])], key=lambda n: (n['created_at'], n['id'])):
                if note['system']:
                    continue
                expected = comment_body(note, item['web_url'], mapping, args.repo)
                found = recover(existing_comments, marker('note', note['id']),
                                state['comments'].get(str(note['id'])))
                if found is None:
                    found = api.write(f'issues/{number}/comments', {'body': expected})
                    existing_comments.append(found)
                check_managed(found['body'], expected)
                state['comments'][str(note['id'])] = {'id': found['id'], 'url': found['html_url']}
                save(state_path, state)
        for ticket in oldmap['tickets'].values():
            child = mapping[f"issue:{ticket['iid']}"]
            parent = mapping[f"issue:{oldmap['gates'][ticket['gate']]['iid']}"]
            children = api.get_all(f"issues/{parent['number']}/sub_issues")
            if child['id'] not in {c['id'] for c in children}:
                api.write(f"issues/{parent['number']}/sub_issues", {'sub_issue_id': child['id']})
            blockers = api.get_all(f"issues/{child['number']}/dependencies/blocked_by")
            for ct in ticket['blockers']:
                blocker = mapping[f"issue:{oldmap['tickets'][ct]['iid']}"]
                if blocker['id'] not in {b['id'] for b in blockers}:
                    api.write(f"issues/{child['number']}/dependencies/blocked_by", {'issue_id': blocker['id']})
        print(json.dumps({'mode': 'apply', 'writes': api.writes, 'mapped': len(mapping)}), flush=True)
    # Readback is mandatory and checks every migrated body, label, state, note and edge.
    errors, comment_count, edge_count = [], 0, 0
    remote_labels = {i['name']: i for i in api.get_all('labels')}
    for label in labels:
        actual = remote_labels.get(label['name'], {})
        if actual.get('color') != label['color'].lstrip('#') or (actual.get('description') or '') != (label.get('description') or ''):
            errors.append('label:' + label['name'])
    for kind, collection, body_fn in [('issue', issues, issue_body), ('mr', mrs, mr_body)]:
        for item in collection:
            key = f"{kind}:{item['iid']}"
            actual = api.request(f"repos/{args.repo}/issues/{mapping[key]['number']}")
            expected_state = 'closed' if item['state'] in ('closed', 'merged') else 'open'
            expected_title = item['title'] if kind == 'issue' else f"[GitLab MR !{item['iid']} — merged archive] {item['title']}"
            if (actual['body'] != body_fn(item, mapping, args.repo) or actual['state'] != expected_state
                    or actual['title'] != expected_title or sorted(l['name'] for l in actual['labels']) != sorted(item['labels'])
                    or sorted(a['login'] for a in actual['assignees']) != sorted(assignees(item))):
                errors.append(key)
            if kind == 'issue':
                actual_notes = api.get_all(f"issues/{mapping[key]['number']}/comments")
                user_notes = [n for n in notes[str(item['iid'])] if not n['system']]
                for note in user_notes:
                    match = identify(actual_notes, marker('note', note['id']))
                    if not match or match['body'] != comment_body(note, item['web_url'], mapping, args.repo):
                        errors.append(f"note:{note['id']}")
                    comment_count += 1
                if len(actual_notes) != len(user_notes):
                    errors.append('comment-count:' + key)
    for ticket in oldmap['tickets'].values():
        child = mapping[f"issue:{ticket['iid']}"]
        parent = mapping[f"issue:{oldmap['gates'][ticket['gate']]['iid']}"]
        actual_parent = api.request(f"repos/{args.repo}/issues/{child['number']}/parent")
        if actual_parent['id'] != parent['id']:
            errors.append('parent:' + str(child['number']))
        actual = api.get_all(f"issues/{child['number']}/dependencies/blocked_by")
        expected = {mapping[f"issue:{oldmap['tickets'][ct]['iid']}"]['id'] for ct in ticket['blockers']}
        if {b['id'] for b in actual} != expected:
            errors.append('blockers:' + str(child['number']))
        edge_count += len(expected)
    result = {'repo': args.repo, 'source_sha256': fingerprint, 'issues': len(issues),
              'historical_mr_records': len(mrs), 'user_comments': comment_count,
              'parent_edges': len(oldmap['tickets']), 'blocker_edges': edge_count,
              'labels': len(labels), 'errors': errors, 'writes': api.writes}
    save(args.report, result)
    print(json.dumps(result), flush=True)
    if errors:
        raise ValueError('Reconciliation failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--state', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--gh', default='gh')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--apply', action='store_true')
    modes.add_argument('--verify', action='store_true')
    migrate(parser.parse_args())
