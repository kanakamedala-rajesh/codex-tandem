"""Disposable live probe; raw Codex output never leaves process memory."""
import os,pathlib,json,subprocess,time,signal,hashlib
ROOT=pathlib.Path('/home/validation/ct05-qualification-20261002')
SPOOL=ROOT/'spool'
HOME=ROOT/'codex-home'
command=['/tmp/codex-tandem-validation-codex','--no-daemon','exec','--skip-git-repo-check','--sandbox','read-only','--json','Reply only OK. Do not use tools.']
def probe(mode):
    before=set(p.name for p in SPOOL.glob('*.json'))
    process=subprocess.Popen(command,cwd='/home/validation',env={**os.environ,'CODEX_HOME':str(HOME)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    killed=False
    if mode=='crash':
        limit=time.monotonic()+20
        while time.monotonic()<limit and process.poll() is None:
            if set(p.name for p in SPOOL.glob('*.json'))-before:
                os.killpg(process.pid,signal.SIGKILL)
                killed=True
                break
            time.sleep(0.01)
    timedout=False
    try: out,err=process.communicate(timeout=50 if mode!='crash' else 3)
    except subprocess.TimeoutExpired:
        timedout=True
        os.killpg(process.pid,signal.SIGKILL)
        out,err=process.communicate(timeout=3)
    records=[]
    for line in out.splitlines():
        try:
            item=json.loads(line)
            if isinstance(item,dict): records.append(item)
        except (ValueError,UnicodeError): pass
    created=sorted(set(p.name for p in SPOOL.glob('*.json'))-before)
    result={'mode':mode,'exit':process.returncode,'timeout':timedout,'killedAfterCapture':killed,'newCommittedEvents':len(created),'nativeTurnStarted':any(i.get('type')=='turn.started' for i in records),'nativeTurnCompleted':any(i.get('type')=='turn.completed' for i in records),'nativeTurnFailed':any(i.get('type')=='turn.failed' for i in records),'assistantReturnedExpectedOK':any(i.get('type')=='item.completed' and i.get('item',{}).get('type')=='agent_message' and i['item'].get('text','').strip()=='OK' for i in records),'untrustedDiagnostic':b'trust' in err.lower(),'hookDegradedDiagnostic':b'CAPTURE_DEGRADED' in err,'recordCount':len(records),'rawRetained':False}
    for filename in created:
        value=json.loads((SPOOL/filename).read_text())
        assert set(value)=={'schemaVersion','eventId','kind','launchId','targetGeneration','sessionId','turnId','capturedAt'}
    diagnostic=(out+err).decode(errors='replace').lower()
    result['failureCategories']=[name for name, needles in {'quota':['usage limit','quota','rate limit'],'authentication':['401','unauthorized','authentication'],'permission':['403','forbidden'],'model':['model'],'network':['connect','network','certificate','tls'],'configuration':['configuration','config']}.items() if any(n in diagnostic for n in needles)]
    result['diagnosticMarkers']=[term for term in ['insufficient','credit','payment','subscription','access','expired','token','disabled','restricted','400','401','403','429','500','unsupported','not found','available','unable','failed','error','usage','limit','balance','capacity','overloaded','retry','budget'] if term in diagnostic]
    result['nativeTypes']=[i.get('type') if i.get('type') in ['thread.started','turn.started','turn.completed','turn.failed','error','item.started','item.updated','item.completed'] else 'other' for i in records]
    result['eventFiles']=created
    print(json.dumps(result),flush=True)
    return result
mode=__import__('sys').argv[1]
if mode not in ('normal','crash','changed','restored'): raise SystemExit('INVALID_EXPERIMENT_MODE')
if mode=='changed':
    hooks=HOME/'hooks.json'
    original=hooks.read_bytes()
    value=json.loads(original)
    value['hooks']['UserPromptSubmit'][0]['hooks'][0]['timeout']=3
    try:
        hooks.write_text(json.dumps(value))
        probe(mode)
    finally: hooks.write_bytes(original)
    print(json.dumps({'exactHookDefinitionRestored':hooks.read_bytes()==original}),flush=True)
else: probe(mode)
