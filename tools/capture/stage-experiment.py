"""Stage only credential-free disposable bridge/hook fixtures on approved target."""
import json, pathlib, subprocess
C='codex-tandem-g0-linux'
ROOT='/home/validation/ct05-qualification-20261002'
repo=pathlib.Path(__file__).resolve().parents[2]
expected='b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf'
actual=subprocess.check_output(['docker','inspect','--format','{{.Id}}',C],text=True).strip()
if actual != expected:
    raise SystemExit('TARGET_GENERATION_CHANGED')
def run(code,data=b''):
    subprocess.run(['docker','exec','-i',C,'/usr/local/bin/python3','-c',code],input=data,check=True)
run("import os; os.umask(0o077); os.mkdir('"+ROOT+"'); os.mkdir('"+ROOT+"/codex-home'); os.mkdir('"+ROOT+"/spool'); os.mkdir('/capture/ct05-20261002')")
def put(path,data):
    run("import os,sys; fd=os.open("+repr(path)+",os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); os.write(fd,sys.stdin.buffer.read()); os.close(fd)",data)
put(ROOT+'/bridge.py',(repo/'tools/capture/bridge.py').read_bytes())
put(ROOT+'/context.json',json.dumps({'launchId':'launch_ct05','targetGeneration':'b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf'}).encode())
put(ROOT+'/codex-home/config.toml',b'')
command='/usr/local/bin/python3 '+ROOT+'/bridge.py --context '+ROOT+'/context.json --spool '+ROOT+'/spool'
hooks={'hooks':{'SessionStart':[{'hooks':[{'type':'command','command':'/bin/true','timeout':2}]}], 'UserPromptSubmit':[{'hooks':[{'type':'command','command':command,'timeout':2}]}]}}
put(ROOT+'/codex-home/hooks.json',json.dumps(hooks).encode())
print(json.dumps({'staged':True,'root':ROOT,'credentials':'NOT_COPIED','hooks':['SessionStart fixture','UserPromptSubmit bridge']}))
