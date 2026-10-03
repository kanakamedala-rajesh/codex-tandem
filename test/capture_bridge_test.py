"""Contract tests invoke the bridge executable; only committed files are receipts."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

BRIDGE = pathlib.Path(os.environ.get('CT05_BRIDGE', str(pathlib.Path(__file__).resolve().parents[1] / 'tools/capture/bridge.py')))
SESSION = '22222222-2222-4222-8222-222222222222'
TURN = '33333333-3333-4333-8333-333333333333'
@unittest.skipUnless(os.name == 'posix', 'bridge requires a qualified private POSIX spool')
class BridgeContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ct05-contract-',dir=os.environ.get('CT05_SPOOL_PARENT'))
        self.root = pathlib.Path(self.tmp.name)
        self.spool = self.root / 'spool'
        self.spool.mkdir(mode=0o700)
        self.context = self.root / 'context.json'
        self.context.write_text(json.dumps({'launchId':'launch_A','targetGeneration':'generation_A'}))
        self.context.chmod(0o600)
    def tearDown(self):
        self.tmp.cleanup()
    def invoke(self, payload):
        return subprocess.run([sys.executable,str(BRIDGE),'--context',str(self.context),'--spool',str(self.spool)],input=payload,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
    def payload(self):
        return json.dumps({'hook_event_name':'UserPromptSubmit','session_id':SESSION,'turn_id':TURN,'prompt':'SECRET_PROMPT','token':'SECRET_TOKEN','tool_input':{'secret':'SECRET_TOOL'}}).encode()
    def test_turn_start_is_private_atomic_metadata_with_neutral_output(self):
        result=self.invoke(self.payload())
        self.assertEqual((result.returncode,result.stdout,result.stderr),(0,b'',b''))
        files=list(self.spool.iterdir())
        self.assertEqual(len(files),1)
        self.assertEqual(files[0].suffix,'.json')
        content=files[0].read_text()
        self.assertNotIn('SECRET',content)
        event=json.loads(content)
        self.assertEqual(set(event),{'schemaVersion','eventId','kind','launchId','targetGeneration','sessionId','turnId','capturedAt'})
        self.assertEqual((event['kind'],event['sessionId'],event['turnId']),('turn.started',SESSION,TURN))
        self.assertEqual(files[0].stat().st_mode & 0o777,0o600)
    def test_rejected_input_never_reaches_disk_or_hook_output(self):
        for payload in [b'{SECRET_MALFORMED', b' '*65537,
                        self.payload().replace(b'UserPromptSubmit',b'PreToolUse'),
                        self.payload().replace(TURN.encode(),b'SECRET_PROMPT'),
                        self.payload().replace(b'SECRET_PROMPT', b'X'*65536)]:
            with self.subTest(size=len(payload)):
                result=self.invoke(payload)
                self.assertEqual((result.returncode,result.stdout,result.stderr),(1,b'',b'CAPTURE_DEGRADED\n'))
                self.assertEqual(list(self.spool.iterdir()),[])
    def test_unsafe_spool_or_context_is_an_explicit_degraded_capture(self):
        for target in [self.spool,self.context]:
            target.chmod(0o777)
            result=self.invoke(self.payload())
            self.assertEqual((result.returncode,result.stdout,result.stderr),(1,b'',b'CAPTURE_DEGRADED\n'))
            self.assertEqual(list(self.spool.iterdir()),[])
            target.chmod(0o700 if target==self.spool else 0o600)
    def test_symlink_spool_is_not_followed(self):
        real=self.root/'real-spool'
        self.spool.rename(real)
        self.spool.symlink_to(real)
        result=self.invoke(self.payload())
        self.assertEqual((result.returncode,result.stdout,result.stderr),(1,b'',b'CAPTURE_DEGRADED\n'))
        self.assertEqual(list(real.iterdir()),[])
    def test_collector_absence_and_os_crash_leave_only_sanitized_atomic_states(self):
        # Fault injection at the OS fsync seam, never in the bridge internals.
        for barrier in [1,2]:
            driver="""import os,runpy,signal,sys
original=os.fsync
barrier=int(sys.argv[1])
count=0
def crash(fd):
 global count
 original(fd)
 count+=1
 if count==barrier: os.kill(os.getpid(),signal.SIGKILL)
os.fsync=crash
sys.argv=sys.argv[2:]
runpy.run_path(sys.argv[0],run_name='__main__')
"""
            result=subprocess.run([sys.executable,'-c',driver,str(barrier),str(BRIDGE),'--context',str(self.context),'--spool',str(self.spool)],input=self.payload(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
            self.assertEqual((result.returncode,result.stdout,result.stderr),(-9,b'',b''))
            files=list(self.spool.iterdir())
            self.assertEqual(len(files),barrier)
            self.assertEqual(len(list(self.spool.glob('*.json'))),barrier-1)
            for file in files:
                self.assertNotIn('SECRET',file.read_text())
                self.assertEqual(json.loads(file.read_text())['turnId'],TURN)
        result=self.invoke(self.payload())
        self.assertEqual(result.returncode,0)
        self.assertEqual(len(list(self.spool.glob('*.json'))),2)
if __name__=='__main__': unittest.main()
