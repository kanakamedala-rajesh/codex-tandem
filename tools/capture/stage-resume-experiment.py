"""Credential-free staging only. Requires separately reviewed exact hook trust."""
import json
import pathlib
import subprocess

TARGET = 'codex-tandem-g0-linux'
GENERATION = 'b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf'
ROOT = '/home/validation/ct06-qualification-20261002'
repo = pathlib.Path(__file__).resolve().parents[2]
if subprocess.check_output(['docker', 'inspect', '--format', '{{.Id}}', TARGET], text=True).strip() != GENERATION:
    raise SystemExit('TARGET_GENERATION_CHANGED')

def run(code, data=b''):
    subprocess.run(['docker', 'exec', '-i', TARGET, '/usr/local/bin/python3', '-c', code], input=data, check=True)

run("import os; os.umask(0o077); os.mkdir('" + ROOT + "'); os.mkdir('" + ROOT + "/codex-home'); os.mkdir('" + ROOT + "/spool')")

def put(path, data, mode=0o600):
    run("import os,sys; fd=os.open(" + repr(path) + ",os.O_WRONLY|os.O_CREAT|os.O_EXCL," + str(mode) + "); os.write(fd,sys.stdin.buffer.read()); os.close(fd)", data)

put(ROOT + '/bridge.py', (repo / 'tools/capture/bridge.py').read_bytes())
for identity in ('A', 'B'):
    put(ROOT + '/context-' + identity + '.json', json.dumps({'launchId':'ct06_' + identity, 'targetGeneration':GENERATION}).encode(), 0o400)
put(ROOT + '/codex-home/config.toml', b'')
command = '/usr/local/bin/python3 ' + ROOT + '/bridge.py --context "$TANDEM_CT06_CONTEXT" --spool ' + ROOT + '/spool'
hooks = {'hooks': {'SessionStart':[{'hooks':[{'type':'command','command':'/bin/true','timeout':2}]}], 'UserPromptSubmit':[{'hooks':[{'type':'command','command':command,'timeout':2}]}]}}
put(ROOT + '/codex-home/hooks.json', json.dumps(hooks).encode())
print(json.dumps({'staged':True,'root':ROOT,'credentials':'NOT_COPIED','hookCommand':command}))
