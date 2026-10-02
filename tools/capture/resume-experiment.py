"""Run inside the explicitly approved disposable container. No raw output export.

Credentials are manually activated between exited A/B runs, outside this script.
Hooks must first be trusted using the normal UI. No production switch is provided.
"""
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
from experiment_environment import prepare_launch_environment

ROOT = pathlib.Path('/home/validation/ct06-qualification-20261002')
SPOOL = ROOT / 'spool'
GENERATION = 'b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf'
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
mode = sys.argv[1]
if mode not in ('A', 'B', 'missing', 'stale'):
    raise SystemExit('INVALID_EXPERIMENT_MODE')
os.umask(0o077)
context_path = None if mode == 'missing' else str(ROOT / ('context-A.json' if mode in ('A','stale') else 'context-B.json'))
env = prepare_launch_environment(os.environ, str(ROOT / 'codex-home'), context_path)
command = ['/tmp/codex-tandem-validation-codex', '--no-daemon', '--sandbox', 'read-only',
           '-c', 'cli_auth_credentials_store="file"', 'exec']
if mode != 'A':
    session = (ROOT / 'session-id').read_text()
    assert UUID.fullmatch(session)
    command += ['resume', '--skip-git-repo-check', '--json', session]
else:
    command += ['--skip-git-repo-check', '--json']
command += ['Reply only OK. Do not use tools.']
before = set(SPOOL.glob('*.json'))
process = subprocess.Popen(command, cwd='/home/validation', env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
timedout = False
try:
    out, err = process.communicate(timeout=50)
except subprocess.TimeoutExpired:
    timedout = True
    os.killpg(process.pid, signal.SIGKILL)
    out, err = process.communicate(timeout=5)
records = []
for line in out.splitlines():
    try:
        item = json.loads(line)
        if isinstance(item, dict):
            records.append(item)
    except (ValueError, UnicodeError):
        pass
sessions = [r.get('thread_id') for r in records if r.get('type') == 'thread.started']
assert len(sessions) == 1 and isinstance(sessions[0],str) and UUID.fullmatch(sessions[0])
if mode == 'A':
    with (ROOT / 'session-id').open('x') as destination:
        destination.write(sessions[0])
events = []
for path in sorted(set(SPOOL.glob('*.json')) - before):
    event = json.loads(path.read_text())
    assert set(event) == {'schemaVersion','eventId','kind','launchId','targetGeneration','sessionId','turnId','capturedAt'}
    assert all(UUID.fullmatch(event[key]) for key in ('eventId','sessionId','turnId'))
    assert event['schemaVersion'] == 1 and event['kind'] == 'turn.started'
    assert event['launchId'] in ('ct06_A','ct06_B') and event['targetGeneration'] == GENERATION
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',event['capturedAt'])
    events.append(event)
# Classify only native error records in memory; never persist/print their text.
errors = [r for r in records if r.get('type') in ('error','turn.failed')]
diagnostic = json.dumps(errors).lower()
categories = [name for name, needles in {
    'QUOTA':['usage limit','insufficient_quota','rate limit'],
    'AUTHENTICATION':['unauthorized','authentication','status 401'],
    'PERMISSION':['forbidden','status 403'],
    'MODEL_UNAVAILABLE':['model_not_found','model is not supported','model does not exist'],
    'NETWORK':['connection','certificate','tls','timed out'],
    'BAD_REQUEST':['status 400','bad request'],
}.items() if any(needle in diagnostic for needle in needles)]
result = {'mode':mode,'exit':process.returncode,'timeout':timedout,
          'sameSession':sessions[0] == (ROOT / 'session-id').read_text(),
          'nativeTurnStarted':any(r.get('type') == 'turn.started' for r in records),
          'nativeTurnCompleted':any(r.get('type') == 'turn.completed' for r in records),
          'nativeTurnFailed':any(r.get('type') == 'turn.failed' for r in records),
          'failureCategories':categories or (['OTHER'] if errors else []),
          'captureDegraded':b'CAPTURE_DEGRADED' in err,
          'expectedLaunchId':'ct06_A' if mode == 'A' else 'ct06_B',
          'events':events,'rawExported':False,'backgroundServerReuse':'NOT_EXECUTED'}
with (ROOT / ('result-' + mode + '.json')).open('x') as destination:
    json.dump(result,destination)
print(json.dumps(result),flush=True)
