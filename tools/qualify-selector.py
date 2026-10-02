"""Qualification of public installed CLI through real ConPTY (Windows) or PTY (Linux).
Windows only: install pywinpty in a separate test-only environment; no runtime dependency.
Usage: python tools/qualify-selector.py NODE INSTALLED_PACKAGE [--windows-deps DIR]
"""
import os, sys, json, time, tempfile, pathlib, subprocess, threading, queue, re
node, package = sys.argv[1:3]
if '--windows-deps' in sys.argv: sys.path.insert(0,sys.argv[sys.argv.index('--windows-deps')+1])
windows=os.name=='nt'
if windows: from winpty import PtyProcess
else: import pty, termios, fcntl, struct
results=[]
with tempfile.TemporaryDirectory(prefix='tandem-selector-') as temp:
 root=pathlib.Path(temp)
 observe=root/'observe.mjs'
 observe.write_text('const write=process.stderr.write.bind(process.stderr);let frame;process.stderr.write=(s,...a)=>{if(frame===undefined&&String(s).includes("Select synthetic"))frame=performance.now();return write(s,...a);};await import(process.env.TANDEM_CLI_URL);process.stderr.write(`\\nFIRST_FRAME_MS:${frame}\\nTERMINAL_RAW:${!!process.stdin.isRaw}\\n`);')
 fail=root/'fail.mjs'
 fail.write_text("const write=process.stderr.write.bind(process.stderr);let failed=false;process.stderr.write=(s,...a)=>{if(!failed&&String(s).includes('Select synthetic')){failed=true;throw Error('test output failure');}return write(s,...a);};")
 def case(name,profiles,keys='',expected=None,resize=False,failure=False,child=False):
  if os.environ.get('TANDEM_CASE_ONLY') and os.environ['TANDEM_CASE_ONLY']!=name: return
  fixture=root/'profiles.json'; fixture.write_text(json.dumps({'schemaVersion':1,'synthetic':True,'profiles':profiles}),encoding='utf8')
  env=os.environ.copy();env['TANDEM_CLI_URL']=(pathlib.Path(package)/'dist/cli.js').resolve().as_uri()
  args=[node]+(['--import',fail.as_uri()] if failure else [])+[str(observe),'--g0-fixture',str(fixture),'--target','local','--','--fixture-no-stdin']
  if child: args=args[:-2]+['--identity','alpha','--','--fixture-wait']
  started=time.perf_counter();chunks=[];q=queue.Queue()
  if windows:
   proc=PtyProcess.spawn(args,env=env,dimensions=(24,100))
   def read():
    try:
     while True:
      chunk=proc.read(4096)
      if not chunk: break
      q.put(chunk)
    except EOFError: pass
   def write(s): proc.write(s)
  else:
   master,slave=pty.openpty();before=termios.tcgetattr(slave)
   fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',24,100,0,0))
   def controlling_terminal():
    os.setsid();fcntl.ioctl(slave,termios.TIOCSCTTY,0)
   proc=subprocess.Popen(args,stdin=slave,stdout=slave,stderr=slave,env=env,preexec_fn=controlling_terminal)
   def read():
    try:
     while True:
      data=os.read(master,4096)
      if not data: break
      q.put(data.decode('utf8','replace'))
    except OSError: pass
   def write(s): os.write(master,s.encode())
  threading.Thread(target=read,daemon=True).start()
  transcript='';sent=False;frame=None;deadline=time.time()+8
  while time.time()<deadline:
   try: transcript+=q.get(timeout=.03)
   except queue.Empty: pass
   if ('G0 harmless child' if child else 'Select synthetic') in transcript and not sent:
    frame=(time.perf_counter()-started)*1000
    if resize:
     if windows: proc.setwinsize(10,60)
     else:
      import signal
      fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',10,60,0,0));os.kill(proc.pid,signal.SIGWINCH)
     time.sleep(.08)
    if child: time.sleep(.1)
    write(keys);sent=True
   if 'TERMINAL_RAW:' in transcript: break
  if windows:
   time.sleep(.08);alive=proc.isalive();code=proc.exitstatus
   if alive: proc.terminate(force=True)
   restored='TERMINAL_RAW:false' in transcript
  else:
   try: code=proc.wait(timeout=2)
   except subprocess.TimeoutExpired: proc.kill();code=-999
   restored=termios.tcgetattr(slave)==before and 'TERMINAL_RAW:false' in transcript
   os.close(master);os.close(slave)
  assert restored,(name,'terminal not restored',transcript)
  if expected: assert expected in transcript,(name,expected,transcript)
  if name in ['cancel','ctrl-c']: assert 'G0 harmless child' not in transcript
  match=re.search(r'FIRST_FRAME_MS:([0-9.]+)',transcript)
  results.append({'case':name,'firstFrameMs':round(float(match.group(1)),2) if match else None,'harnessWallMs':round(frame,2) if frame else None,'restored':restored,'exit':code,'transcript':transcript})
 profiles=[{'id':'alpha','label':'日本語'},{'id':'beta','label':'同じ'},{'id':'gamma','label':'同じ'}]
 case('zero',[],expected='NO_PROFILES')
 case('one',profiles[:1],'\r',expected='Selected synthetic profile [alpha]')
 case('two',profiles[:2],'\x1b[B\r',expected='Selected synthetic profile [beta]')
 case('many-unicode-duplicate',profiles,'\x1b[B\x1b[B\x1b[A\r',expected='Selected synthetic profile [beta]',resize=True)
 case('long-duplicate-labels',[{'id':'alpha','label':'同じ'*60},{'id':'beta','label':'同じ'*60}],'\x1b[B\r',expected='Selected synthetic profile [beta]',resize=True)
 case('cancel',profiles,'\x1b',expected='TERMINAL_RAW:false')
 case('ctrl-c',profiles,'\x03',expected='TERMINAL_RAW:false')
 case('exception',profiles,failure=True,expected='SELECTOR_FAILED')
 case('child-ctrl-c',profiles,'\x03',expected='TERMINAL_RAW:false',child=True)
 for n in range(20): case('timing-'+str(n),profiles,'\x1b',expected='TERMINAL_RAW:false')
 times=sorted(r['firstFrameMs'] for r in results if r['case'].startswith('timing'))
 print(json.dumps({'platform':sys.platform,'node':subprocess.check_output([node,'--version'],text=True).strip(),'harness':'ConPTY/pywinpty' if windows else 'POSIX PTY/termios','p95FirstFrameMs':times[18] if len(times)>=20 else None,'results':results},ensure_ascii=True,indent=2))


