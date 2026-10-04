"""Exercise remote ownership using real private files and bounded process metadata."""
import ast
import base64
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


if __name__ == '__main__':
    unittest.main()
