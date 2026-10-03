"""Credential-free fixture staging for the explicitly approved CT07 target."""
import hashlib
import json
import pathlib
import subprocess

TARGET = 'codex-tandem-g0-sandbox-v2'
GENERATION = '057df0f1fa2c691b7341cfe3688817b3ed86f09462f2c830e343e48075f623e2'
ROOT = '/home/validation/ct07-qualification-20261002'
assert subprocess.check_output(['docker', 'inspect', '--format', '{{.Id}}', TARGET], text=True).strip() == GENERATION

def run(code, data=b''):
    return subprocess.check_output(['docker', 'exec', '-i', '--user', '1000', GENERATION, '/usr/local/bin/python3', '-c', code], input=data)

run("import os; os.umask(0o077); os.mkdir('" + ROOT + "'); os.mkdir('" + ROOT + "/codex-home'); os.mkdir('" + ROOT + "/project')")

def put(path, data, mode):
    run("import os,sys; f=os.fdopen(os.open(" + repr(path) + ",os.O_WRONLY|os.O_CREAT|os.O_EXCL," + str(mode) + "),'wb'); f.write(sys.stdin.buffer.read()); f.close()", data)

hashes = {}
for name in ('build.py', 'calculator.py', 'input.json'):
    data = (pathlib.Path(__file__).parent / 'fixture' / name).read_bytes()
    put(ROOT + '/project/' + name, data, 0o400)
    hashes[name] = hashlib.sha256(data).hexdigest()
put(ROOT + '/source-hashes.json', json.dumps(hashes).encode(), 0o600)
put(ROOT + '/codex-home/config.toml', b'cli_auth_credentials_store = "file"\n', 0o600)
print(json.dumps({'staged': True, 'credentials': 'NOT_COPIED', 'root': ROOT, 'sourceSha256': hashes}))
