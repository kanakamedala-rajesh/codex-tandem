import json, subprocess
target='057df0f1fa2c691b7341cfe3688817b3ed86f09462f2c830e343e48075f623e2'
code=r'''
import json,pathlib,socket,subprocess,threading,os
root=pathlib.Path('/home/validation/ct07-qualification-20261002')
project=root/'project'
home=root/'sandbox-probe-home'
home.mkdir(mode=0o700,exist_ok=True)
guard=project/'sandbox_guard.py'
guard.write_text("""import json,pathlib,socket,sys,errno
p=pathlib.Path.cwd()/'guard-allowed.txt'
p.write_text('synthetic'); p.unlink()
denied=False
outside=pathlib.Path.cwd().parent/'guard-forbidden.txt'
try:
 outside.write_text('synthetic'); outside.unlink()
except OSError as e: denied=e.errno in (errno.EPERM,errno.EACCES,errno.EROFS)
network=False; error=None
try:
 with socket.create_connection((sys.argv[1],int(sys.argv[2])),timeout=2) as s: s.recv(5)
except OSError as e:
 error=e.errno
 network=error in (errno.EPERM,errno.EACCES,errno.ENETUNREACH,errno.EHOSTUNREACH,errno.ECONNREFUSED)
result=dict(workspaceWriteAllowed=True,outsideWorkspaceWriteDenied=denied,networkDenied=network,networkErrno=error)
print(json.dumps(result)); sys.exit(0 if denied and network else 1)
""")
server=socket.socket(); server.bind(('0.0.0.0',0)); server.listen()
port=server.getsockname()[1]; address=socket.gethostbyname(socket.gethostname())
def serve():
 while True:
  try:
   client,_=server.accept()
   with client: client.sendall(b'guard')
  except OSError: return
threading.Thread(target=serve,daemon=True).start()
def reachable():
 with socket.create_connection((address,port),timeout=2) as s: return s.recv(5)==b'guard'
before=reachable()
env=os.environ.copy(); env['HOME']='/home/validation'; env['CODEX_HOME']=str(home)
command=[str(root/'runtime/bin/codex'),'--sandbox','workspace-write','sandbox','-c','sandbox_mode="workspace-write"','--','/usr/local/bin/python3',str(guard),address,str(port)]
probe=subprocess.run(command,cwd=project,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
after=reachable(); server.close()
try: result=json.loads(probe.stdout)
except ValueError: result={}
print(json.dumps(dict(exit=probe.returncode,guard=result,unsandboxedNetworkReachableBefore=before,unsandboxedNetworkReachableAfter=after,credentialFreeDiagnostic=probe.stderr.decode(errors='replace')[:1000])))
'''
result=subprocess.run(['docker','exec','-i','--user','1000',target,'/usr/local/bin/python3','-c',code],capture_output=True,text=True,timeout=30)
if result.returncode: raise RuntimeError(result.stderr[:1000])
data=json.loads(result.stdout)
print(json.dumps(data))
raise SystemExit(0 if data['exit']==0 and data['unsandboxedNetworkReachableBefore'] and data['unsandboxedNetworkReachableAfter'] else 1)
