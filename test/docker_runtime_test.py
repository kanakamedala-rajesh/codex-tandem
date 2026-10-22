"""Exercise remote ownership using real private files and bounded process metadata."""
import ast
import base64
import contextlib
import io
import json
import os
import pathlib
import posixpath
import tempfile
import subprocess
import sys
import threading
import types
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / 'src' / 'docker-runtime.py'
BOOT = '00000000-0000-0000-0000-000000000001'
LAUNCH = '00000000-0000-0000-0000-000000000002'


def runtime():
    # Load actual runtime definitions without invoking its command-line dispatch
    # or changing this test runner's import path.
    tree = ast.parse(SOURCE.read_text(encoding='utf8'))
    nodes = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))]
    nodes += [n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'uuid_pattern' for t in n.targets)]
    module = types.ModuleType('remote_runtime_under_test')
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), module.__dict__)
    return module


def native(pid, name='sleep'):
    return {'pid': pid, 'creation': BOOT + ':' + str(pid) + ':10000', 'parent': 1, 'state': 'S', 'uid': 10000, 'name': name}


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.code = runtime()
        self.rows = {42: native(42, 'codex')}
        self.records = {}
        self.raw = b'HOME=/private/user\x00'
        namespace = types.SimpleNamespace(path=types.SimpleNamespace(join=posixpath.join, basename=posixpath.basename, realpath=posixpath.normpath, isdir=lambda p: bool(self.records)), environ={'HOME': '/controller'}, getpid=lambda: 99, geteuid=lambda: 10000, listdir=lambda p: list(map(str, self.rows)) if p == '/proc' else list(self.records), readlink=lambda p: '/bin/' + self.rows[int(p.split('/')[2])]['name'])
        self.code.os = namespace
        self.code.identity = lambda p: self.rows.get(p)
        self.code.record = lambda p: self.records[posixpath.basename(p)]
        self.code.open = lambda *a: io.BytesIO(self.raw)

    def inventory(self):
        return self.code.inventory('/private/user/.codex', '/bin/codex', '/private/user/.codex/.tandem-activation')

    def process_record(self, state='running'):
        self.records['process-' + LAUNCH + '.json'] = {'schemaVersion': 1, 'home': '/private/user/.codex', 'nonce': 'a' * 64, 'launchId': LAUNCH, 'supervisor': native(41), 'child': native(42), 'state': state}
        self.rows[42] = native(42)
        self.raw = b''

    def test_external_codex_scope_uses_its_home(self):
        values = self.inventory()
        self.assertEqual([p['pid'] for p in values], [42])
        self.assertFalse(values[0]['managed'])
        self.raw = b'HOME=/other\x00'
        self.assertEqual(self.inventory(), [])
        self.raw = b'HOME=/other\x00CODEX_HOME=/private/user/.codex\x00'
        self.assertEqual([p['pid'] for p in self.inventory()], [42])

    def test_unknown_external_scope_blocks(self):
        for raw in [b'', b'HOME=relative\x00', b'CODEX_HOME=relative\x00']:
            self.raw = raw
            with self.assertRaisesRegex(self.code.Refused, 'REMOTE_PROCESS_OWNER_UNPROVEN'):
                self.inventory()

    def test_stored_child_survives_supervisor_loss_and_empty_environment(self):
        self.process_record()
        values = self.inventory()
        self.assertEqual([p['pid'] for p in values], [42])
        self.assertTrue(values[0]['managed'])
        self.assertEqual(values[0]['role'], 'child')
        self.assertEqual(values[0]['launchId'], LAUNCH)

    def test_incomplete_record_never_proves_descendant_absence(self):
        self.process_record()
        self.rows.clear()
        with self.assertRaisesRegex(self.code.Refused, 'REMOTE_DESCENDANTS_UNPROVEN'):
            self.inventory()
        self.records['process-' + LAUNCH + '.json']['state'] = 'exited'
        self.assertEqual(self.inventory(), [])


@unittest.skipUnless(os.name == 'posix', 'Remote kernel file-lock semantics require POSIX')
class ControllerTests(unittest.TestCase):
    def test_mutex_is_persistent_noninherited_and_released_on_holder_death(self):
        code = runtime()
        with tempfile.TemporaryDirectory(prefix='ct14-kernel-lock-') as home:
            path = home + '/.tandem-docker-owner.lock'
            child = None
            try:
                with code.control_mutex(home) as held:
                    self.assertFalse(os.get_inheritable(held[0]))
                    original = os.stat(path).st_ino
                    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'], close_fds=False)
                # Even an explicitly inheriting subprocess cannot retain this fd.
                with code.control_mutex(home):
                    self.assertEqual(os.stat(path).st_ino, original)
                    self.assertIsNone(child.poll())
            finally:
                if child is not None:
                    child.terminate()
                    child.wait(timeout=5)
            script = "import runpy,sys,time; c=runpy.run_path(sys.argv[1])['runtime'](); " + "\nwith c.control_mutex(sys.argv[2]):\n print('LOCKED',flush=True); time.sleep(30)"
            holder = subprocess.Popen([sys.executable, '-B', '-c', script, __file__, home], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertEqual(holder.stdout.readline().strip(), 'LOCKED')
                with self.assertRaisesRegex(code.Refused, 'REMOTE_SCOPE_BUSY'):
                    with code.control_mutex(home):
                        pass
                holder.kill()
                holder.wait(timeout=5)
                with code.control_mutex(home):
                    self.assertEqual(os.stat(path).st_ino, original)
            finally:
                if holder.poll() is None:
                    holder.kill()
                    holder.wait(timeout=5)
                holder.stdout.close()
                holder.stderr.close()

    def test_mutex_refuses_symlink_and_hardlink(self):
        code = runtime()
        with tempfile.TemporaryDirectory(prefix='ct14-lock-path-') as home:
            path = home + '/.tandem-docker-owner.lock'
            other = home + '/other'
            code.write(other, b'')
            os.symlink(other, path)
            with self.assertRaises(OSError):
                with code.control_mutex(home):
                    pass
            os.unlink(path)
            os.link(other, path)
            with self.assertRaisesRegex(code.Refused, 'REMOTE_PRIVATE_PERMISSIONS_REQUIRED'):
                with code.control_mutex(home):
                    pass

    def test_legacy_or_unknown_guard_protocol_refuses_recovery_without_mutation(self):
        code = runtime()
        with tempfile.TemporaryDirectory(prefix='ct14-legacy-guard-') as root:
            home = root + '/home'
            os.mkdir(home, 0o700)
            journal, lock = home + '/.tandem-activation', home + '/.tandem-docker.lock'
            os.mkdir(journal, 0o700)
            os.mkdir(lock, 0o700)
            code.pinned_paths = lambda *a: [(1, 1)]
            code.identity = lambda pid: None
            code.write(home + '/auth.json', b'CURRENT')
            code.write(journal + '/selected.json', b'SELECTED')
            for version in [1, 3]:
                owner = {'schemaVersion': version, 'home': home, 'nonce': '0' * 64, 'manager': native(40)}
                code.put(lock + '/owner.json', owner)
                original = os.stat(lock).st_ino
                with self.assertRaisesRegex(code.Refused, 'REMOTE_GUARD_INVALID'):
                    code.control(home, root, '/bin/true', 'a' * 64)
                self.assertEqual(os.stat(lock).st_ino, original)
                self.assertEqual(code.record(lock + '/owner.json'), owner)
                self.assertEqual(code.read(home + '/auth.json'), b'CURRENT')
                self.assertEqual(code.read(journal + '/selected.json'), b'SELECTED')

    def test_contending_recovery_cannot_replace_a_live_guard_or_selected_bytes(self):
        code = runtime()
        with tempfile.TemporaryDirectory(prefix='ct14-ownership-') as root:
            home = root + '/home'
            os.mkdir(home, 0o700)
            journal, lock = home + '/.tandem-activation', home + '/.tandem-docker.lock'
            os.mkdir(journal, 0o700)
            os.mkdir(lock, 0o700)
            code.put(lock + '/owner.json', {'schemaVersion': 2, 'home': home, 'nonce': '0' * 64, 'manager': native(40)})
            local = threading.local()
            entered, release = threading.Event(), threading.Event()
            replies, failures = {}, {}
            code.os = types.SimpleNamespace(**{n: getattr(os, n) for n in dir(os)})
            code.os.getpid = lambda: local.pid
            code.identity = lambda p: None if p == 40 else native(p)
            code.pinned_paths = lambda *a: [(1, 1)]
            def inventory(*args):
                if local.pid == 41 and not getattr(local, 'paused', False):
                    local.paused = True
                    entered.set()
                    if not release.wait(5):
                        raise AssertionError('recovery barrier timed out')
                return []
            code.inventory = inventory
            class Input:
                def __iter__(self):
                    return iter([json.dumps({'action': 'stage', 'auth': base64.b64encode(str(local.pid).encode()).decode()}), json.dumps({'action': 'replace', 'expected': None})])
            code.sys = types.SimpleNamespace(stdin=Input(), stdout=types.SimpleNamespace(flush=lambda: None))
            code.print = lambda text: replies.setdefault(local.pid, []).append(json.loads(text))
            def run(pid):
                local.pid = pid
                try:
                    code.control(home, root, '/bin/true', ('a' if pid == 41 else 'b') * 64)
                except Exception as error:
                    failures[pid] = str(error)
            first = threading.Thread(target=run, args=(41,))
            first.start()
            try:
                self.assertTrue(entered.wait(5))
                second = threading.Thread(target=run, args=(42,))
                second.start()
                second.join(5)
                self.assertFalse(second.is_alive())
                self.assertEqual(failures.get(42), 'REMOTE_SCOPE_BUSY')
                self.assertNotIn(42, replies)
            finally:
                release.set()
                first.join(5)
            self.assertFalse(first.is_alive())
            self.assertNotIn(41, failures)
            self.assertTrue(all(p['ok'] for p in replies[41]))
            self.assertEqual(code.read(home + '/auth.json'), b'41')
            self.assertEqual(code.record(lock + '/owner.json')['manager']['pid'], 41)




@unittest.skipUnless(sys.platform == 'linux', 'Native target resume witnesses require Linux procfs')
class PreparedResumeTests(unittest.TestCase):
    def setUp(self):
        self.code = runtime()
        self.root = tempfile.TemporaryDirectory(prefix='ct15-remote-resume-')
        self.addCleanup(self.root.cleanup)
        self.home = pathlib.Path(self.root.name) / 'home'
        self.project = pathlib.Path(self.root.name) / 'project'
        self.other = pathlib.Path(self.root.name) / 'other'
        for path in [self.home, self.project, self.other]:
            path.mkdir(mode=0o700)
        self.source = self.home / 'sessions' / ('rollout-2026-01-01T00-00-00-' + LAUNCH + '.jsonl')
        self.source.parent.mkdir(mode=0o700)
        self.source.write_text(json.dumps({'type': 'session_meta', 'payload': {'id': LAUNCH, 'cwd': str(self.project), 'timestamp': '2026-01-01T00:00:00.123456789Z'}}) + '\n' + 'SYNTHETIC-CONVERSATION-MUST-NOT-ESCAPE\n')
        self.database = self.home / 'state_5.sqlite'
        # The normal path must not inspect SQLite at all, including these bytes.
        self.database.write_bytes(b'SYNTHETIC-NOT-A-SQLITE-DATABASE')
        self.executable = pathlib.Path(self.root.name) / 'codex'
        self.write_rpc()
        self.code.folder(str(self.home / '.tandem-activation'))
        # In-process controller fixtures supply native identities separately from
        # the CI runner's UID; retain fresh physical pins without qualifying root.
        self.code.pinned_paths = lambda *paths: [(os.stat(path).st_dev, os.stat(path).st_ino) for path in paths]

    def test_controller_refuses_root_before_credentials_or_ownership_files(self):
        code = runtime()
        code.os = types.SimpleNamespace(**{name: getattr(os, name) for name in dir(os)})
        code.os.geteuid = lambda: 0
        # Setup verified the real private home; isolate the unmodified root guard.
        code.folder = lambda path: None
        with self.assertRaisesRegex(code.Refused, 'ROOT_TARGET_UNSUPPORTED'):
            code.control(str(self.home), str(self.project), str(self.executable), 'a' * 64)
        for name in ['auth.json', '.tandem-docker.lock', '.tandem-docker-owner.lock']:
            self.assertFalse((self.home / name).exists())

    def write_rpc(self, version='0.163.0', mutate=False, row_cwd=None, rows=None, mutate_cache=False, shutdown_output=False, retained=False):
        row = {'id': LAUNCH, 'cwd': row_cwd or str(self.project), 'path': str(self.source), 'preview': 'SYNTHETIC-PREVIEW-MUST-NOT-ESCAPE', 'turns': ['SYNTHETIC-CONTENT']}
        program = '''import json,signal,sys,os,time
HOME=%r
ROWS=%r
if %r:
 def changed(signum,frame):
  with open(HOME+'/state_5.sqlite','ab') as f:f.write(b'changed-on-close')
  sys.exit(0)
 signal.signal(signal.SIGTERM,changed)
if %r:
 def cleared(signum,frame):
  for suffix in ['-wal','-shm']:
   try:os.unlink(HOME+'/state_5.sqlite'+suffix)
   except FileNotFoundError:pass
  sys.exit(0)
 signal.signal(signal.SIGTERM,cleared)
if %r:signal.signal(signal.SIGTERM,signal.SIG_IGN)
if %r:
 def finished(signum,frame):
  signal.signal(signal.SIGTERM,signal.SIG_IGN)
  for fd in [1,2]:os.write(fd,b'SYNTHETIC-SHUTDOWN-NOT-METADATA'*%d)
  sys.exit(0)
 signal.signal(signal.SIGTERM,finished)
for line in sys.stdin:
 r=json.loads(line);method=r.get('method')
 if 'id' not in r:continue
 result={}
 if method=='initialize':result={'userAgent':'codex_cli_rs/%s (Linux)'}
 if method=='config/read':result={'config':{'cli_auth_credentials_store':'file','sqlite_home':HOME},'layers':[]}
 if method=='configRequirements/read':result={'requirements':None}
 if method=='thread/list':
  if r['params'].get('useStateDbOnly') is not True:sys.exit(17)
  result={'data':[] if r['params']['archived'] else ROWS,'nextCursor':None}
 print(json.dumps({'id':r['id'],'result':result}),flush=True)
if %r:finished(None,None)
if %r:time.sleep(30)
''' % (str(self.home), rows if rows is not None else [row], mutate, mutate_cache, retained, shutdown_output, 8192 if shutdown_output is True else shutdown_output, version, shutdown_output, retained)
        self.executable.write_text('#!' + sys.executable + '\n' + program)
        self.executable.chmod(0o700)

    def prepare(self, selection=LAUNCH):
        return self.code.policy(str(self.project), str(self.executable), [], None, resume_selection=selection, home=str(self.home))

    @contextlib.contextmanager
    def policy_children(self):
        children = []
        original = self.code.subprocess
        def launch(*args, **kwargs):
            child = subprocess.Popen(*args, **kwargs)
            children.append(child)
            return child
        self.code.subprocess = types.SimpleNamespace(Popen=launch, PIPE=subprocess.PIPE, TimeoutExpired=subprocess.TimeoutExpired)
        try:
            yield children
        finally:
            self.code.subprocess = original
            # These are only the harmless children created by this test.
            for child in children:
                if child.poll() is None:
                    child.kill()
                child.wait(timeout=5)
                for stream in [child.stdin, child.stdout, child.stderr]:
                    stream.close()

    def test_policy_drains_both_shutdown_pipes_after_eof_and_owned_sigterm(self):
        for include_resume in [False, True]:
            with self.subTest(include_resume=include_resume):
                self.write_rpc(shutdown_output=True)
                with self.policy_children() as children:
                    result = self.code.policy(str(self.project), str(self.executable), [], None, include_resume=include_resume, home=str(self.home))
                    self.assertEqual(result['config']['cli_auth_credentials_store'], 'file')
                    self.assertNotIn('SYNTHETIC-SHUTDOWN', json.dumps(result))
                    self.assertEqual(children[0].poll(), 0)
                    self.assertTrue(children[0].stdout.closed)
                    self.assertTrue(children[0].stderr.closed)

    def test_policy_shutdown_output_still_obeys_the_metadata_limit(self):
        self.write_rpc(shutdown_output=65536)
        with self.policy_children() as children:
            with self.assertRaisesRegex(self.code.Refused, 'REMOTE_POLICY_INSPECTION_FAILED'):
                self.code.policy(str(self.project), str(self.executable), [], None)
            self.assertEqual(children[0].poll(), 0)

    def test_policy_refuses_a_genuinely_retained_owned_child(self):
        self.write_rpc(retained=True)
        with self.policy_children() as children:
            with self.assertRaisesRegex(self.code.Refused, 'REMOTE_POLICY_PROCESS_RETAINED'):
                self.code.policy(str(self.project), str(self.executable), [], None, include_resume=True, home=str(self.home))
            self.assertIsNone(children[0].poll())

    def test_policy_refuses_changed_identity_without_signalling_it(self):
        original = self.code.identity
        calls = [0]
        def changed(pid):
            value = original(pid)
            calls[0] += 1
            return dict(value, creation=value['creation'] + '-changed') if value and calls[0] > 1 else value
        self.code.identity = changed
        with self.policy_children() as children:
            with self.assertRaisesRegex(self.code.Refused, 'REMOTE_POLICY_PROCESS_CHANGED'):
                self.code.policy(str(self.project), str(self.executable), [], None, include_resume=True, home=str(self.home))
            self.assertIsNone(children[0].poll())

    def test_empty_wal_and_safe_shm_disposal_survive_preparation_and_ordinary_policy(self):
        self.write_rpc(mutate_cache=True)
        wal, shm = [self.home / ('state_5.sqlite' + suffix) for suffix in ['-wal', '-shm']]
        wal.write_bytes(b'')
        shm.write_bytes(b'synthetic coordination cache')
        prepared = self.prepare()
        self.assertFalse(wal.exists())
        self.assertFalse(shm.exists())
        self.code.resume_store(str(self.home), str(self.project), str(self.executable), None, prepared, LAUNCH)
        for path in [shm, wal]:
            path.write_bytes(b'synthetic coordination cache' if path == shm else b'')
            self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None)
            path.unlink()
            path.write_bytes(b'')
            self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None)
            path.unlink()
            self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None)
        wal.write_bytes(b'')
        shm.write_bytes(b'synthetic second cache')
        context = self.code.policy(str(self.project), str(self.executable), [], None, include_resume=True, home=str(self.home))
        self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None, context['resume'])

    def test_nonempty_wal_main_and_journal_generations_remain_strict(self):
        wal = self.home / 'state_5.sqlite-wal'
        wal.write_bytes(b'synthetic WAL data')
        prepared = self.prepare()
        for content in [None, b'', b'synthetic WAL DATA', b'synthetic WAL data']:
            with self.subTest(wal_content=content is None or bool(content)):
                if wal.exists():wal.unlink()
                if content is not None:wal.write_bytes(content)
                with self.assertRaisesRegex(self.code.Refused, 'RESUME_PREPARATION_STALE'):
                    self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None)
        wal.unlink()
        prepared = self.prepare()
        journal = self.home / 'state_5.sqlite-journal'
        journal.write_bytes(b'')
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_PREPARATION_STALE'):
            self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None)
        journal.unlink()
        prepared = self.prepare()
        self.database.write_bytes(b'X' * self.database.stat().st_size)
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_PREPARATION_STALE'):
            self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None)

    def test_sidecar_safety_is_fresh_even_for_disposable_cache_files(self):
        prepared = self.prepare()
        target = pathlib.Path(self.root.name) / 'cache-target'
        target.write_bytes(b'synthetic cache')
        for suffix in ['-wal', '-shm']:
            path = self.home / ('state_5.sqlite' + suffix)
            for kind in ['dangling', 'symbolic', 'hardlink', 'directory']:
                with self.subTest(suffix=suffix, kind=kind):
                    try:
                        if kind == 'dangling':path.symlink_to(pathlib.Path(self.root.name) / 'missing-target')
                        if kind == 'symbolic':path.symlink_to(target)
                        if kind == 'hardlink':os.link(target, path)
                        if kind == 'directory':path.mkdir()
                        with self.assertRaisesRegex(self.code.Refused, 'RESUME_SOURCE_UNSAFE'):
                            self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None)
                    finally:
                        if path.is_dir() and not path.is_symlink():path.rmdir()
                        else:path.unlink()

    def test_sidecar_stat_denial_precision_and_new_hardlinks_stay_blocking(self):
        prepared = self.prepare()
        original = self.code.os
        for suffix in ['-wal', '-shm']:
            target = str(self.home / ('state_5.sqlite' + suffix))
            pathlib.Path(target).write_bytes(b'')
            for failure in ['denied', 'precision', 'hardlink', 'nonregular']:
                with self.subTest(suffix=suffix, failure=failure):
                    class FreshStat:
                        def __getattr__(proxy, name):
                            return getattr(original, name)
                        def stat(proxy, path):
                            info = original.stat(path)
                            if path != target:return info
                            if failure == 'denied':raise PermissionError(13, 'synthetic sidecar denial')
                            fields = {name: getattr(info, name) for name in ['st_mode', 'st_dev', 'st_ino', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns']}
                            if failure == 'precision':fields.pop('st_mtime_ns')
                            if failure == 'hardlink':fields['st_nlink'] = 2
                            if failure == 'nonregular':fields['st_mode'] = 0o40700
                            return types.SimpleNamespace(**fields)
                    self.code.os = FreshStat()
                    expected = 'RESUME_SOURCE_UNAVAILABLE' if failure == 'denied' else 'RESUME_WITNESS_PRECISION_UNSUPPORTED' if failure == 'precision' else 'RESUME_SOURCE_UNSAFE'
                    try:
                        with self.assertRaisesRegex(self.code.Refused, expected):
                            self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None)
                    finally:
                        self.code.os = original
            pathlib.Path(target).unlink()

    def test_explicit_preparation_preserves_proved_project_last_selection(self):
        newer = '00000000-0000-0000-0000-000000000003'
        source = self.source.with_name('rollout-2026-01-02T00-00-00-' + newer + '.jsonl')
        source.write_text(json.dumps({'type': 'session_meta', 'payload': {'id': newer, 'cwd': str(self.project), 'timestamp': '2026-01-02T00:00:00Z'}}) + '\n')
        self.write_rpc(rows=[{'id': identifier, 'cwd': str(self.project), 'path': str(path)} for identifier, path in [(LAUNCH, self.source), (newer, source)]])
        self.code.identity = lambda pid: native(pid)
        self.code.inventory = lambda *args: []
        requests = [{'action': 'pin', 'paths': [{'path': str(self.project), 'root': str(self.project)}]},
                    {'action': 'resume-prepare', 'selection': 'last', 'arguments': []},
                    {'action': 'resume-prepare', 'selection': LAUNCH, 'arguments': []},
                    {'action': 'resume', 'selection': 'last'}, {'action': 'release'}]
        output = io.StringIO()
        self.code.sys = types.SimpleNamespace(stdin=iter(json.dumps(request) + '\n' for request in requests), stdout=output)
        self.code.print = lambda value: print(value, file=output)
        self.code.control(str(self.home), str(self.project), str(self.executable), 'a' * 64)
        replies = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertTrue(all(reply['ok'] for reply in replies))
        self.assertEqual([reply['result'] for reply in replies[2:5]], [newer, LAUNCH, newer])

    def test_final_supervisor_refuses_changed_configuration_or_persistent_data_before_spawn(self):
        original_os = self.code.os
        simulated = {path: pathlib.Path(self.root.name) / filename for path, filename in [('/etc/codex/requirements.toml', 'requirements.toml'), ('/etc/codex/managed_config.toml', 'managed_config.toml')]}
        class Paths:
            def __getattr__(proxy, name):
                return getattr(original_os.path, name)
            def realpath(proxy, path):
                return original_os.path.realpath(simulated.get(path, path))
            def lexists(proxy, path):
                return original_os.path.lexists(simulated.get(path, path))
        class Filesystem:
            path = Paths()
            def __getattr__(proxy, name):
                return getattr(original_os, name)
            def stat(proxy, path):
                return original_os.stat(simulated.get(path, path))
            def lstat(proxy, path):
                return original_os.lstat(simulated.get(path, path))
        self.code.os = Filesystem()
        self.code.identity = lambda pid: native(pid)
        self.code.inventory = lambda *args: []
        claims = {'https://api.openai.com/auth': {'chatgpt_account_id': 'synthetic-account', 'chatgpt_user_id': 'synthetic-user'}}
        token = 'e30.' + base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=') + '.synthetic'
        auth = base64.b64encode(json.dumps({'tokens': {'account_id': 'synthetic-account', 'id_token': token}}).encode()).decode()
        mutations = [self.project / '.codex' / 'config.toml', self.project / '.codex' / 'config.toml', pathlib.Path(self.root.name) / '.codex' / 'config.toml', self.project / '.git'] + list(simulated.values()) + [simulated['/etc/codex/managed_config.toml'], self.home / 'state_5.sqlite-wal', self.home / 'state_5.sqlite-journal', self.database]
        for index, changed in enumerate(mutations):
            with self.subTest(configuration=index):
                active = {'home': str(self.home), 'generation': 1, 'profileId': 'synthetic-profile', 'bindingId': 'synthetic-binding', 'transactionId': 'synthetic-transaction'}
                transaction = {'id': active['transactionId'], 'phase': 'complete', 'resolved': {'profileId': active['profileId'], 'bindingId': active['bindingId']}}
                launch = {'id': LAUNCH, 'home': str(self.home), 'project': str(self.project), 'executable': str(self.executable), 'generation': 1, 'profileId': active['profileId'], 'bindingId': active['bindingId'], 'environmentWrapper': None}
                requests = [{'action': 'pin', 'paths': [{'path': str(self.project), 'root': str(self.project)}]}, {'action': 'resume-prepare', 'selection': LAUNCH, 'arguments': []}, {'action': 'resume', 'selection': LAUNCH}, {'action': 'policy', 'arguments': [], 'wrapper': None}, {'action': 'metadata', 'name': 'active', 'value': active}, {'action': 'metadata', 'name': 'transaction', 'value': transaction}, {'action': 'stage', 'auth': auth}, {'action': 'replace', 'expected': auth if index else None}, {'action': 'prepare', 'value': launch}]
                output = io.StringIO()
                self.code.sys = types.SimpleNamespace(stdin=iter(json.dumps(request) + '\n' for request in requests), stdout=output)
                self.code.print = lambda value: print(value, file=output)
                self.code.control(str(self.home), str(self.project), str(self.executable), 'a' * 64)
                self.assertTrue(all(json.loads(line)['ok'] for line in output.getvalue().splitlines()))
                changed.parent.mkdir(parents=True, exist_ok=True)
                changed.write_text('' if changed.name.endswith('-journal') else 'synthetic configuration generation ' + str(index) + '\n')
                self.code.ctypes = types.SimpleNamespace(CDLL=lambda *args, **kwargs: types.SimpleNamespace(prctl=lambda *args: 0))
                self.code.signal = types.SimpleNamespace(SIGINT=2, SIGTERM=15, SIGHUP=1, SIG_IGN=1, signal=lambda *args: None)
                previous_subprocess = self.code.subprocess
                def forbidden_spawn(*args, **kwargs):
                    raise AssertionError('stale configuration reached child spawn')
                self.code.subprocess = types.SimpleNamespace(Popen=forbidden_spawn)
                try:
                    with self.assertRaisesRegex(self.code.Refused, 'RESUME_PREPARATION_STALE'):
                        self.code.launch(str(self.home), str(self.project), str(self.executable), 'a' * 64, LAUNCH, ['resume', LAUNCH])
                    status = self.code.record(str(self.home / '.tandem-activation' / ('process-' + LAUNCH + '.json')))
                    self.assertEqual((status['state'], status['exitCode']), ('exited', 2))
                finally:
                    self.code.subprocess = previous_subprocess
                    (self.home / '.tandem-docker.lock' / 'owner.json').unlink()
                    (self.home / '.tandem-docker.lock').rmdir()
                    for path in [self.home / '.tandem-activation' / ('launch-' + LAUNCH + '.json'), self.home / '.tandem-activation' / ('process-' + LAUNCH + '.json')]:
                        path.unlink(missing_ok=True)

    def test_preparation_projects_metadata_and_normal_resume_reads_only_fixed_witnesses(self):
        prepared = self.prepare()
        self.assertNotIn('SYNTHETIC-PREVIEW', json.dumps(prepared))
        self.assertNotIn('SYNTHETIC-CONVERSATION', json.dumps(prepared))
        self.code.resume_store(str(self.home), str(self.project), str(self.executable), None, prepared, 'last')
        policy = self.code.policy(str(self.project), str(self.executable), [], None, include_resume=True, home=str(self.home))
        self.code.resume_revalidate(prepared, str(self.home), str(self.project), str(self.executable), None, policy['resume'])
        original = self.code.os
        history, database = str(self.source.parent), str(self.database)
        class FixedReads:
            def __getattr__(proxy, name):
                return getattr(original, name)
            def open(proxy, path, *args):
                if str(path).startswith(history) or str(path).startswith(database):
                    raise AssertionError('normal resume read history or database bytes')
                return original.open(path, *args)
            def scandir(proxy, path):
                raise AssertionError('normal resume enumerated a directory')
            listdir = scandir
        self.code.os = FixedReads()
        for selection in [LAUNCH, 'last']:
            self.assertEqual(self.code.resume_session(str(self.home), str(self.project), str(self.executable), None, selection)['id'], LAUNCH)
        # A same-size write is still a different data generation.
        self.database.write_bytes(b'X' * self.database.stat().st_size)
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_PREPARATION_STALE'):
            self.code.resume_session(str(self.home), str(self.project), str(self.executable), None, LAUNCH)

    def test_preparation_refuses_legacy_capability_and_shutdown_mutation(self):
        self.write_rpc(version='0.159.0')
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_INDEX_UNSUPPORTED'):
            self.prepare()
        self.write_rpc(mutate=True)
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_PREPARATION_STALE'):
            self.prepare()
        self.assertFalse((self.home / '.tandem-activation' / 'resume').exists())

    def test_reprepare_retains_each_prepared_uuid_project_binding(self):
        first = self.prepare()
        self.code.resume_store(str(self.home), str(self.project), str(self.executable), None, first, LAUNCH)
        second = dict(first, id='00000000-0000-0000-0000-000000000003')
        self.code.resume_store(str(self.home), str(self.project), str(self.executable), None, second, 'last')
        self.assertEqual(self.code.resume_session(str(self.home), str(self.project), str(self.executable), None, LAUNCH)['id'], LAUNCH)
        self.assertEqual(self.code.resume_session(str(self.home), str(self.project), str(self.executable), None, 'last')['id'], second['id'])
        before = pathlib.Path(self.code.resume_record_path(str(self.home), str(self.project), LAUNCH)).read_bytes()
        rebound = dict(first, project=self.code.resume_witness(str(self.other)), cwd=self.code.resume_witness(str(self.other)), nativeCwd=self.code.resume_witness(str(self.other)), configuration=[self.code.resume_witness(path) for path in self.code.resume_configuration_paths(first['policy'], str(self.other))])
        entries = [rebound[k] for k in ['home', 'project', 'cwd', 'nativeCwd', 'source']] + rebound['command'] + rebound['configuration'] + rebound['database']
        rebound['ancestors'] = self.code.resume_ancestors([entry['path'] for entry in entries])
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_PROJECT_MISMATCH'):
            self.code.resume_store(str(self.home), str(self.other), str(self.executable), None, rebound, LAUNCH)
        self.assertEqual(pathlib.Path(self.code.resume_record_path(str(self.home), str(self.project), LAUNCH)).read_bytes(), before)
        self.project.rename(self.project.with_name('retired-project'))
        self.project.mkdir(mode=0o700)
        rebound = dict(first, project=self.code.resume_witness(str(self.project)), cwd=self.code.resume_witness(str(self.project)), nativeCwd=self.code.resume_witness(str(self.project)))
        entries = [rebound[k] for k in ['home', 'project', 'cwd', 'nativeCwd', 'source']] + rebound['command'] + rebound['configuration'] + rebound['database']
        rebound['ancestors'] = self.code.resume_ancestors([entry['path'] for entry in entries])
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_PROJECT_MISMATCH'):
            self.code.resume_store(str(self.home), str(self.project), str(self.executable), None, rebound, LAUNCH)
        self.assertEqual(pathlib.Path(self.code.resume_record_path(str(self.home), str(self.project), LAUNCH)).read_bytes(), before)


    def test_postexit_database_changes_do_not_block_remote_idle_sync_or_release(self):
        prepared = self.prepare()
        self.code.resume_store(str(self.home), str(self.project), str(self.executable), None, prepared, 'last')
        self.code.identity = lambda pid: native(pid)
        self.code.inventory = lambda *args: []
        def requests():
            yield json.dumps({'action': 'pin', 'paths': [{'path': str(self.project), 'root': str(self.project)}]}) + '\n'
            yield json.dumps({'action': 'resume', 'selection': LAUNCH}) + '\n'
            yield json.dumps({'action': 'policy', 'arguments': [], 'wrapper': None}) + '\n'
            # Represents ordinary history changes by an already exited child.
            self.database.write_bytes(b'POST-EXIT-NATIVE-DATABASE-GENERATION')
            for action in ['check', 'snapshot', 'release']:
                yield json.dumps({'action': action}) + '\n'
        output = io.StringIO()
        self.code.sys = types.SimpleNamespace(stdin=requests(), stdout=output)
        import contextlib
        with contextlib.redirect_stdout(output):
            self.code.control(str(self.home), str(self.project), str(self.executable), 'a' * 64)
        replies = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(replies), 7)
        self.assertTrue(all(reply['ok'] for reply in replies))
        self.assertFalse((self.home / '.tandem-docker.lock').exists())

    def test_preparation_refuses_indexed_header_scope_conflict(self):
        self.write_rpc(row_cwd=str(self.other))
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_PROJECT_MISMATCH'):
            self.prepare()
        self.write_rpc()
        self.source.write_text(json.dumps({'type': 'session_meta', 'payload': {'id': LAUNCH, 'cwd': str(self.other), 'timestamp': '2026-01-01T00:00:00Z'}}) + '\n')
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_METADATA_CONFLICT'):
            self.prepare()

    def test_precision_and_wrapper_context_refuse_unsupported_inputs(self):
        original = self.code.os
        class FloatOnlyStat:
            def __getattr__(proxy, name):
                return getattr(original, name)
            def stat(proxy, path):
                info = original.stat(path)
                return types.SimpleNamespace(**{name: getattr(info, name) for name in ['st_mode', 'st_dev', 'st_ino', 'st_nlink', 'st_size', 'st_mtime', 'st_ctime']})
        self.code.os = FloatOnlyStat()
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_WITNESS_PRECISION_UNSUPPORTED'):
            self.code.resume_witness(str(self.database), data=True)
        self.code.os = original
        with self.assertRaisesRegex(self.code.Refused, 'RESUME_CONFIG_UNSUPPORTED'):
            self.code.resume_policy({}, [], str(self.home), str(self.project), '/approved/wrapper')
        self.assertEqual(self.code.resume_policy({'sqlite_home': str(self.home)}, [], str(self.home), str(self.project), '/approved/wrapper')['sqliteHome'], str(self.home))


if __name__ == '__main__':
    unittest.main()
